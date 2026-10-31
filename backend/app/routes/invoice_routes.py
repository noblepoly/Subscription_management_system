import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from flask import Blueprint, request, jsonify, g
from app.db import db_session
from app.models.invoice import Invoice, InvoiceItem
from app.models.user import User
from app.services.billing_engine import run_recurring_billing_cycle
from app.utils.security import login_required, role_required

invoice_bp = Blueprint("invoices", __name__, url_prefix="/api/invoices")
billing_bp = Blueprint("billing", __name__, url_prefix="/api/billing")

@invoice_bp.route("", methods=["GET"])
@login_required
def list_invoices():
    """
    List invoices.
    - If CUSTOMER: strictly scoped to g.current_user.id
    - If ADMIN or STAFF: can view all or filter by customer_id or status
    """
    query = Invoice.query

    if g.current_user.role == "CUSTOMER":
        query = query.filter(Invoice.customer_id == g.current_user.id)
    else:
        cust_id = request.args.get("customer_id")
        if cust_id:
            try:
                query = query.filter(Invoice.customer_id == uuid.UUID(str(cust_id)))
            except (ValueError, TypeError):
                pass

    status = request.args.get("status")
    if status and status.upper() != "ALL":
        query = query.filter(Invoice.status == status.upper())

    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(Invoice.invoice_number.ilike(search_pattern))

    invoices = query.order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc()).all()
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
    """
    Get invoice details with items and payment history.
    Enforces customer ownership.
    """
    invoice = Invoice.query.filter_by(id=invoice_id).first()
    if not invoice:
        return jsonify({
            "success": False,
            "error": "Invoice not found.",
            "code": "INVOICE_NOT_FOUND"
        }), 404

    if g.current_user.role == "CUSTOMER" and invoice.customer_id != g.current_user.id:
        return jsonify({
            "success": False,
            "error": "Access denied.",
            "code": "FORBIDDEN"
        }), 403

    return jsonify({
        "success": True,
        "invoice": invoice.to_dict(),
        "data": {
            "invoice": invoice.to_dict()
        }
    }), 200


@billing_bp.route("/run-cycle", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def trigger_billing_cycle():
    """
    Manually triggers the recurring billing cycle engine.
    Finds active subscriptions whose next_billing_date has arrived and generates invoices.
    """
    try:
        result = run_recurring_billing_cycle()
        return jsonify({
            "success": True,
            "message": f"Recurring billing cycle executed successfully. {result['invoices_generated']} invoices generated.",
            "data": result
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Billing cycle failed: {str(e)}",
            "code": "BILLING_CYCLE_ERROR"
        }), 500
