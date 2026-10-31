from flask import Flask, jsonify
from flask_cors import CORS
from app.config import Config
from app.db import db_session

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Enable CORS for frontend Vite development server
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db_session.remove()

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({
            "status": "healthy",
            "service": "Brightloop Subscription Management System API",
            "version": "1.0.0"
        }), 200

    return app
