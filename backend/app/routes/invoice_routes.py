import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from flask import Blueprint, request, jsonify, g
import app.db
from app.db import db_session
from app.models.invoice import Invoice, InvoiceItem
from app.models.subscription import Subscription
from app.models.user import User
from app.utils.security import login_required, role_required
from app.services.billing_engine import run_recurring_billing_cycle

invoice_bp = Blueprint("invoices", __name__, url_prefix="/api/invoices")
billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")

@invoice_bp.route("", methods=["GET"])
@login_required
def list_invoices():
    """
    List invoices with customer data isolation and filtering.
    Customers can only view their own invoices.
    Staff and Admins can view all or filter by customer_id.
    """
    query = Invoice.query

    # Enforce customer data isolation
    if g.current_user.role == "CUSTOMER":
        query = query.filter(Invoice.customer_id == g.current_user.id)
    else:
        cust_id = request.args.get("customer_id") or request.args.get("customerId")
        if cust_id:
            try:
                cust_uuid = uuid.UUID(cust_id)
                query = query.filter(Invoice.customer_id == cust_uuid)
            except ValueError:
                return jsonify({
                    "success": False,
                    "error": "Invalid customer_id format.",
                    "code": "INVALID_CUSTOMER_ID"
                }), 400

    status = (request.args.get("status") or "").strip().upper()
    if status and status != "ALL":
        query = query.filter(Invoice.status == status)

    search = (request.args.get("search") or "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.join(Invoice.customer).filter(
            (Invoice.invoice_number.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern)) |
            (User.email.ilike(search_pattern))
        )

    invoices = query.order_by(Invoice.created_at.desc()).all()
    serialized = [i.to_dict() for i in invoices]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "invoices": serialized,
        "data": {
            "total": len(serialized),
            "invoices": serialized
        }
    }), 200


@invoice_bp.route("/<uuid:invoice_id>", methods=["GET"])
@login_required
def get_invoice(invoice_id):
    """Get single invoice details with customer access scoping."""
    inv = Invoice.query.filter_by(id=invoice_id).first()
    if not inv:
        return jsonify({
            "success": False,
            "error": "Invoice not found.",
            "code": "INVOICE_NOT_FOUND"
        }), 404

    if g.current_user.role == "CUSTOMER" and inv.customer_id != g.current_user.id:
        return jsonify({
            "success": False,
            "error": "Access denied to customer invoice.",
            "code": "FORBIDDEN"
        }), 403

    return jsonify({
        "success": True,
        "invoice": inv.to_dict(),
        "data": {
            "invoice": inv.to_dict()
        }
    }), 200


@invoice_bp.route("/run-billing", methods=["POST"])
@login_required
@role_required(["ADMIN", "STAFF"])
def run_billing():
    """
    Staff / Admin: Trigger recurring billing run across all active subscriptions due for invoicing.
    Accepts optional 'target_date' (YYYY-MM-DD).
    Strictly prevents duplicate invoice generation.
    """
    data = request.get_json(silent=True) or {}
    target_date_str = data.get("target_date") or request.args.get("target_date")
    target_d = None
    if target_date_str:
        try:
            target_d = date.fromisoformat(target_date_str)
        except ValueError:
            return jsonify({
                "success": False,
                "error": "Invalid date format. Expected YYYY-MM-DD.",
                "code": "INVALID_DATE_FORMAT"
            }), 400

    try:
        result = run_recurring_billing_cycle(target_d)
    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Failed to execute recurring billing cycle.",
            "code": "BILLING_CYCLE_FAILED",
            "details": str(e)
        }), 500

    return jsonify({
        "success": True,
        "message": f"Recurring billing run completed. Generated {result['invoices_generated']} invoices.",
        "result": result,
        "data": result
    }), 200


# Direct frontend endpoint compatibility: /api/billing/run-cycle
@billing_bp.route("/run-cycle", methods=["POST"])
@login_required
@role_required(["ADMIN", "STAFF"])
def run_cycle_alias():
    return run_billing()
