from flask import Flask, render_template, request, jsonify, session, redirect, url_for, g
from datetime import timedelta
import secrets
import string
import math
from io import StringIO
from flask import Response
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["SECRET_KEY"] = "change-me-in-production"
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=12)
    app.config["DATABASE"] = "app.db"

    def get_db():
        conn = getattr(g, "_db_conn", None)
        if conn is None:
            conn = sqlite3.connect(app.config["DATABASE"], check_same_thread=False)
            conn.row_factory = sqlite3.Row
            g._db_conn = conn
        return conn

    @app.teardown_appcontext
    def close_db(exception):
        conn = getattr(g, "_db_conn", None)
        if conn is not None:
            conn.close()

    def init_db():
        db = get_db()
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            );
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                password TEXT NOT NULL,
                strength_percent INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_passwords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                website TEXT NOT NULL,
                login TEXT NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        db.commit()

    with app.app_context():
        init_db()

    @app.after_request
    def add_no_cache_headers(response):
        try:
            path = request.path or ""
        except Exception:
            path = ""
        dynamic_prefixes = (
            "/generate",
            "/history",
            "/clear_history",
            "/export",
            "/saved_passwords",
        )
        if any(path.startswith(p) for p in dynamic_prefixes):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
        return response

    @app.before_request
    def load_logged_in_user():
        user_id = session.get("user_id")
        g.user = None
        if user_id is not None:
            db = get_db()
            row = db.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
            if row:
                g.user = {"id": row["id"], "username": row["username"]}

    @app.route("/")
    def index():
        return render_template("index.html", user=g.user)

    # ---------------------- AUTH ----------------------
    @app.route("/register", methods=["GET", "POST"]) 
    def register():
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            if not username or not password:
                return render_template("register.html", error="Заполните все поля")
            if len(username) < 3 or len(password) < 6:
                return render_template("register.html", error="Логин ≥ 3, пароль ≥ 6 символов")
            db = get_db()
            try:
                db.execute(
                    "INSERT INTO users(username, password_hash) VALUES(?, ?)",
                    (username, generate_password_hash(password))
                )
                db.commit()
            except sqlite3.IntegrityError:
                return render_template("register.html", error="Пользователь уже существует")
            # авто-логин
            row = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            session["user_id"] = row["id"]
            session.permanent = True
            return redirect(url_for("index"))
        return render_template("register.html")

    @app.route("/login", methods=["GET", "POST"]) 
    def login():
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            db = get_db()
            row = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
            if row and check_password_hash(row["password_hash"], password):
                session["user_id"] = row["id"]
                session.permanent = True
                return redirect(url_for("index"))
            return render_template("login.html", error="Неверный логин или пароль")
        return render_template("login.html")

    @app.route("/logout", methods=["POST"]) 
    def logout():
        session.pop("user_id", None)
        return redirect(url_for("index"))

    @app.route("/generate", methods=["POST"]) 
    def generate():
        payload = request.get_json(silent=True) or {}

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

        level = (payload.get("level") or "custom").lower()
        uppercase = bool(payload.get("uppercase", True))
        lowercase = bool(payload.get("lowercase", True))
        numbers = bool(payload.get("numbers", True))
        symbols = bool(payload.get("symbols", True))

        if level in ("low", "medium", "high", "max"):
            if level == "low":
                lowercase, uppercase, numbers, symbols = True, False, True, False
            elif level == "medium":
                lowercase, uppercase, numbers, symbols = True, True, True, False
            elif level == "high":
                lowercase, uppercase, numbers, symbols = True, True, True, True
            elif level == "max":
                lowercase, uppercase, numbers, symbols = True, True, True, True

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

        def strength_label_and_percent(bits: float):
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
                    "bits": round(bits, 1)
                })
        except ValueError as e:
            if str(e) == "no_charsets":
                return jsonify({"error": "Выберите хотя бы один тип символов"}), 400
            raise

        session.permanent = True
        # Save history per user if authenticated; else keep session-based
        if g.user:
            db = get_db()
            db.executemany(
                "INSERT INTO history(user_id, password, strength_percent) VALUES(?, ?, ?)",
                [(g.user["id"], it["password"], int(it["score_percent"])) for it in passwords]
            )
            db.commit()
        else:
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
                "level": level
            }
        })

    @app.route("/history", methods=["GET"]) 
    def history():
        if g.user:
            db = get_db()
            rows = db.execute(
                "SELECT password AS p, strength_percent AS s FROM history WHERE user_id = ? ORDER BY id DESC LIMIT 50",
                (g.user["id"],)
            ).fetchall()
            items = [{"p": r["p"], "s": r["s"]} for r in rows]
            return jsonify({"history": items})
        history = session.get("history", [])
        return jsonify({"history": list(reversed(history[-50:]))})

    @app.route("/clear_history", methods=["POST"]) 
    def clear_history():
        if g.user:
            db = get_db()
            db.execute("DELETE FROM history WHERE user_id = ?", (g.user["id"],))
            db.commit()
            return jsonify({"ok": True})
        session["history"] = []
        return jsonify({"ok": True})

    @app.route("/export", methods=["GET"]) 
    def export():
        fmt = (request.args.get("fmt") or "txt").lower()
        if g.user:
            db = get_db()
            rows = db.execute(
                "SELECT password AS p, strength_percent AS s FROM history WHERE user_id = ? ORDER BY id",
                (g.user["id"],)
            ).fetchall()
            items = [{"p": r["p"], "s": r["s"]} for r in rows]
        else:
            items = session.get("history", [])
        if not items:
            return jsonify({"error": "История пуста"}), 400

        if fmt == "csv":
            sio = StringIO()
            sio.write("password,strength_percent\n")
            for it in items:
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

    # ---------------------- SAVED PASSWORDS ----------------------
    @app.route("/saved_passwords", methods=["GET"])
    def get_saved_passwords():
        if not g.user:
            return jsonify({"error": "Требуется авторизация"}), 401
        db = get_db()
        rows = db.execute(
            "SELECT id, website, login, password, created_at, updated_at FROM saved_passwords WHERE user_id = ? ORDER BY updated_at DESC",
            (g.user["id"],)
        ).fetchall()
        passwords = [{"id": r["id"], "website": r["website"], "login": r["login"], "password": r["password"], "created_at": r["created_at"], "updated_at": r["updated_at"]} for r in rows]
        return jsonify({"passwords": passwords})

    @app.route("/saved_passwords", methods=["POST"])
    def add_saved_password():
        if not g.user:
            return jsonify({"error": "Требуется авторизация"}), 401
        data = request.get_json()
        website = (data.get("website") or "").strip()
        login = (data.get("login") or "").strip()
        password = (data.get("password") or "").strip()
        
        if not website or not login or not password:
            return jsonify({"error": "Заполните все поля"}), 400
        
        db = get_db()
        try:
            cursor = db.execute(
                "INSERT INTO saved_passwords(user_id, website, login, password) VALUES(?, ?, ?, ?)",
                (g.user["id"], website, login, password)
            )
            db.commit()
            return jsonify({"id": cursor.lastrowid, "message": "Пароль сохранен"})
        except Exception as e:
            return jsonify({"error": "Ошибка при сохранении"}), 500

    @app.route("/saved_passwords/<int:password_id>", methods=["PUT"])
    def update_saved_password(password_id):
        if not g.user:
            return jsonify({"error": "Требуется авторизация"}), 401
        data = request.get_json()
        website = (data.get("website") or "").strip()
        login = (data.get("login") or "").strip()
        password = (data.get("password") or "").strip()
        
        if not website or not login or not password:
            return jsonify({"error": "Заполните все поля"}), 400
        
        db = get_db()
        try:
            cursor = db.execute(
                "UPDATE saved_passwords SET website = ?, login = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (website, login, password, password_id, g.user["id"])
            )
            if cursor.rowcount == 0:
                return jsonify({"error": "Пароль не найден"}), 404
            db.commit()
            return jsonify({"message": "Пароль обновлен"})
        except Exception as e:
            return jsonify({"error": "Ошибка при обновлении"}), 500

    @app.route("/saved_passwords/<int:password_id>", methods=["DELETE"])
    def delete_saved_password(password_id):
        if not g.user:
            return jsonify({"error": "Требуется авторизация"}), 401
        
        db = get_db()
        try:
            cursor = db.execute(
                "DELETE FROM saved_passwords WHERE id = ? AND user_id = ?",
                (password_id, g.user["id"])
            )
            if cursor.rowcount == 0:
                return jsonify({"error": "Пароль не найден"}), 404
            db.commit()
            return jsonify({"message": "Пароль удален"})
        except Exception as e:
            return jsonify({"error": "Ошибка при удалении"}), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=1111)
