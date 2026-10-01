import os

from flask import Flask

from bot_auth import bot_auth_bp
from chal1 import chal1_bp
from chal2 import chal2_bp
from chal3 import chal3_bp
from chal4 import chal4_bp
from db import close_db, init_db, start_purge_thread


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ["SECRET_KEY"]
    app.config.update(
        SESSION_COOKIE_SECURE=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        MAX_CONTENT_LENGTH=32 * 1024,
    )

    init_db()
    app.teardown_appcontext(close_db)
    start_purge_thread()

    app.register_blueprint(bot_auth_bp)
    app.register_blueprint(chal1_bp)
    app.register_blueprint(chal2_bp)
    app.register_blueprint(chal3_bp)
    app.register_blueprint(chal4_bp)

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
