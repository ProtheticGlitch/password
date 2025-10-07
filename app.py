from flask import Flask, render_template, request, jsonify, session
from datetime import timedelta
import secrets
import string
import math
from io import StringIO
from flask import Response


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["SECRET_KEY"] = "change-me-in-production"  # замените на безопасный секрет
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=12)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/generate", methods=["POST"]) 
    def generate():
        payload = request.get_json(silent=True) or {}

        # Валидация входных параметров
        try:
            length = int(payload.get("length", 12))
        except (TypeError, ValueError):
            length = 12
        length = max(8, min(64, length))

        try:
            count = int(payload.get("count", 1))
        except (TypeError, ValueError):
            count = 1
        count = max(1, min(20, count))

        mode = (payload.get("mode") or "password").lower()
        level = (payload.get("level") or "custom").lower()
        uppercase = bool(payload.get("uppercase", True))
        lowercase = bool(payload.get("lowercase", True))
        numbers = bool(payload.get("numbers", True))
        symbols = bool(payload.get("symbols", True))

        # Применяем преднастроенный уровень сложности, если указан
        if level in ("low", "medium", "high", "max"):
            if level == "low":
                lowercase, uppercase, numbers, symbols = True, False, True, False
            elif level == "medium":
                lowercase, uppercase, numbers, symbols = True, True, True, False
            elif level == "high":
                lowercase, uppercase, numbers, symbols = True, True, True, True
            elif level == "max":
                lowercase, uppercase, numbers, symbols = True, True, True, True

        # Подготовка генераторов для двух режимов
        charsets = []
        if uppercase:
            charsets.append(string.ascii_uppercase)
        if lowercase:
            charsets.append(string.ascii_lowercase)
        if numbers:
            charsets.append(string.digits)
        if symbols:
            charsets.append("!@#$%^&*()_+-=[]{}|;:,.<>?")

        alphabet = "".join(charsets) if charsets else ""

        def generate_one_password() -> str:
            if not charsets:
                raise ValueError("no_charsets")
            required = [secrets.choice(s) for s in charsets]
            remaining_len = max(0, length - len(required))
            rest = [secrets.choice(alphabet) for _ in range(remaining_len)]
            candidate = required + rest
            for i in range(len(candidate) - 1, 0, -1):
                j = secrets.randbelow(i + 1)
                candidate[i], candidate[j] = candidate[j], candidate[i]
            return "".join(candidate)

        def entropy_bits_password(pwd: str) -> float:
            size = 0
            if any(c.islower() for c in pwd):
                size += 26
            if any(c.isupper() for c in pwd):
                size += 26
            if any(c.isdigit() for c in pwd):
                size += 10
            if any(not c.isalnum() for c in pwd):
                size += 30
            size = max(size, 1)
            return len(pwd) * math.log2(size)

        # Небольшой встроенный словарь (можно расширять)
        WORDLIST = [
            "север","юг","восток","запад","огонь","вода","земля","воздух","камень","лес","горный",
            "ночь","день","лужа","сокол","ветер","код","линза","луна","снег","мост","пламя",
            "буря","туман","ветка","море","корабль","ключ","замок","река","озеро","искра","время"
        ]

        def generate_one_passphrase(words_count: int, sep: str, capitalize: bool) -> str:
            chosen = [secrets.choice(WORDLIST) for _ in range(words_count)]
            if capitalize:
                chosen = [w.capitalize() for w in chosen]
            return sep.join(chosen)

        def entropy_bits_passphrase(words_count: int) -> float:
            # энтропия динон-системы: log2(V^n) = n * log2(V)
            vocab = max(len(WORDLIST), 1)
            return words_count * math.log2(vocab)

        def strength_label_and_percent(bits: float):
            # 128 бит == 100%, 100 бит ~ 80%, 60 бит ~ 50%
            percent = max(0, min(100, round(bits / 128 * 100)))
            if percent >= 90:
                label = "Отличный"
            elif percent >= 70:
                label = "Хороший"
            elif percent >= 50:
                label = "Средний"
            elif percent >= 30:
                label = "Слабый"
            else:
                label = "Очень слабый"
            return label, percent

        passwords = []
        try:
            if mode == "passphrase":
                words_count = int(payload.get("words", 4))
                words_count = max(3, min(10, words_count))
                sep = str(payload.get("sep", "-"))[:3]
                capitalize_words = bool(payload.get("capitalize", False))
                for _ in range(count):
                    pwd = generate_one_passphrase(words_count, sep, capitalize_words)
                    bits = entropy_bits_passphrase(words_count)
                    label, percent = strength_label_and_percent(bits)
                    passwords.append({
                        "password": pwd,
                        "strength": label,
                        "score_percent": percent,
                        "bits": round(bits, 1),
                        "mode": "passphrase"
                    })
            else:
                if not charsets:
                    return jsonify({"error": "Выберите хотя бы один тип символов"}), 400
                for _ in range(count):
                    pwd = generate_one_password()
                    bits = entropy_bits_password(pwd)
                    label, percent = strength_label_and_percent(bits)
                    passwords.append({
                        "password": pwd,
                        "strength": label,
                        "score_percent": percent,
                        "bits": round(bits, 1),
                        "mode": "password"
                    })
        except ValueError as e:
            if str(e) == "no_charsets":
                return jsonify({"error": "Выберите хотя бы один тип символов"}), 400
            raise

        # История в сессии (до 100 последних паролей)
        session.permanent = True
        history = session.get("history", [])
        for item in passwords:
            history.append({"p": item["password"], "s": item["score_percent"]})
        session["history"] = history[-100:]

        return jsonify({
            "passwords": passwords,
            "meta": {
                "length": length,
                "count": count,
                "flags": {"uppercase": uppercase, "lowercase": lowercase, "numbers": numbers, "symbols": symbols},
                "level": level,
                "mode": mode,
            }
        })

    @app.route("/history", methods=["GET"]) 
    def history():
        history = session.get("history", [])
        # Возвращаем последние 50 по убыванию свежести
        return jsonify({"history": list(reversed(history[-50:]))})

    @app.route("/clear_history", methods=["POST"]) 
    def clear_history():
        session["history"] = []
        return jsonify({"ok": True})

    @app.route("/export", methods=["GET"]) 
    def export():
        fmt = (request.args.get("fmt") or "txt").lower()
        items = session.get("history", [])
        if not items:
            return jsonify({"error": "История пуста"}), 400

        if fmt == "csv":
            sio = StringIO()
            sio.write("password,strength_percent\n")
            for it in items:
                # простейшее экранирование запятых
                p = str(it.get("p", "")).replace(",", " ")
                s = str(it.get("s", ""))
                sio.write(f"{p},{s}\n")
            data = sio.getvalue()
            return Response(
                data,
                mimetype="text/csv; charset=utf-8",
                headers={"Content-Disposition": "attachment; filename=generated_passwords.csv"}
            )
        else:
            text = "\n".join(str(it.get("p", "")) for it in items)
            return Response(
                text,
                mimetype="text/plain; charset=utf-8",
                headers={"Content-Disposition": "attachment; filename=generated_passwords.txt"}
            )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)