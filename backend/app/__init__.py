from flask import Flask, jsonify
from flask_cors import CORS
from app.config import Config
from app.db import db_session
from app.routes.auth_routes import auth_bp
from app.routes.user_routes import user_bp
from app.routes.product_routes import product_bp
from app.routes.plan_routes import plan_bp
from app.routes.tax_routes import tax_bp
from app.routes.discount_routes import discount_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Enable CORS for frontend Vite development server
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(product_bp)
    app.register_blueprint(plan_bp)
    app.register_blueprint(tax_bp)
    app.register_blueprint(discount_bp)

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
