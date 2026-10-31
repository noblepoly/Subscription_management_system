import uuid
from datetime import datetime, timezone, date
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify, g
import app.db
from app.db import db_session
from app.models.payment import Payment
from app.models.invoice import Invoice
from app.models.user import User
from app.utils.security import login_required, role_required
from app.utils.financial import quantize_money

payment_bp = Blueprint("payments", __name__, url_prefix="/api/payments")

VALID_PAYMENT_METHODS = {"BANK_TRANSFER", "CASH", "CHEQUE", "ONLINE_MOCK_SIMULATED"}

@payment_bp.route("", methods=["GET"])
@login_required
def list_payments():
    """
    List payments with customer scoping and filtering.
    Customers can only view their own payments.
    Staff and Admins can view all or filter by customer_id or invoice_id.
    """
    query = Payment.query

    # Enforce customer data isolation
    if g.current_user.role == "CUSTOMER":
        query = query.filter(Payment.customer_id == g.current_user.id)
    else:
        cust_id = request.args.get("customer_id") or request.args.get("customerId")
        if cust_id:
            try:
                cust_uuid = uuid.UUID(cust_id)
                query = query.filter(Payment.customer_id == cust_uuid)
            except ValueError:
                return jsonify({
                    "success": False,
                    "error": "Invalid customer_id format.",
                    "code": "INVALID_CUSTOMER_ID"
                }), 400

    inv_id = request.args.get("invoice_id")
    if inv_id:
        try:
            inv_uuid = uuid.UUID(inv_id)
            query = query.filter(Payment.invoice_id == inv_uuid)
        except ValueError:
            return jsonify({
                "success": False,
                "error": "Invalid invoice_id format.",
                "code": "INVALID_INVOICE_ID"
            }), 400

    status = (request.args.get("payment_status") or request.args.get("status") or "").strip().upper()
    if status and status != "ALL":
        query = query.filter(Payment.payment_status == status)

    payments = query.order_by(Payment.payment_date.desc()).all()
    serialized = [p.to_dict() for p in payments]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "payments": serialized,
        "data": {
            "total": len(serialized),
            "payments": serialized
        }
    }), 200


@payment_bp.route("/<uuid:payment_id>", methods=["GET"])
@login_required
def get_payment(payment_id):
    """Get single payment details with customer scoping."""
    pay = Payment.query.filter_by(id=payment_id).first()
    if not pay:
        return jsonify({
            "success": False,
            "error": "Payment not found.",
            "code": "PAYMENT_NOT_FOUND"
        }), 404

    if g.current_user.role == "CUSTOMER" and pay.customer_id != g.current_user.id:
        return jsonify({
            "success": False,
            "error": "Access denied to customer payment.",
            "code": "FORBIDDEN"
        }), 403

    return jsonify({
        "success": True,
        "payment": pay.to_dict(),
        "data": {
            "payment": pay.to_dict()
        }
    }), 200


@payment_bp.route("", methods=["POST"])
@login_required
def record_payment():
    """
    Record a new payment for an invoice.
    Enforces customer isolation (customers can only pay their own invoices).
    Offline payments recorded by customers default to PENDING_VERIFICATION.
    Staff and Admins can record verified offline payments.
    Online simulated payments automatically confirm.
    """
    data = request.get_json() or {}

    invoice_id_raw = data.get("invoice_id")
    if not invoice_id_raw:
        return jsonify({
            "success": False,
            "error": "invoice_id is required.",
            "code": "MISSING_INVOICE_ID"
        }), 400

    try:
        invoice_id = uuid.UUID(str(invoice_id_raw))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid invoice_id format.",
            "code": "INVALID_INVOICE_ID"
        }), 400

    invoice = Invoice.query.filter_by(id=invoice_id).first()
    if not invoice:
        return jsonify({
            "success": False,
            "error": "Invoice not found.",
            "code": "INVOICE_NOT_FOUND"
        }), 404

    # Customer scoping check: customer can only pay for their own invoice
    if g.current_user.role == "CUSTOMER" and invoice.customer_id != g.current_user.id:
        return jsonify({
            "success": False,
            "error": "Access denied. You cannot record payments for another customer's invoice.",
            "code": "FORBIDDEN"
        }), 403

    if invoice.status in ("PAID", "CANCELLED"):
        return jsonify({
            "success": False,
            "error": f"Cannot make payment on invoice with status {invoice.status}.",
            "code": "INVOICE_NOT_PAYABLE"
        }), 400

    # Parse and validate amount
    amount_raw = data.get("amount")
    if amount_raw is None:
        return jsonify({
            "success": False,
            "error": "amount is required.",
            "code": "MISSING_AMOUNT"
        }), 400

    try:
        amount = quantize_money(amount_raw)
    except (InvalidOperation, TypeError, ValueError):
        return jsonify({
            "success": False,
            "error": "Invalid amount format.",
            "code": "INVALID_AMOUNT"
        }), 400

    if amount <= Decimal("0.00"):
        return jsonify({
            "success": False,
            "error": "Payment amount must be greater than zero.",
            "code": "INVALID_AMOUNT"
        }), 400

    if amount > invoice.balance_due:
        return jsonify({
            "success": False,
            "error": f"Payment amount ({amount}) exceeds outstanding balance due ({invoice.balance_due}).",
            "code": "AMOUNT_EXCEEDS_BALANCE"
        }), 400

    payment_method = (data.get("payment_method") or "BANK_TRANSFER").strip().upper()
    if payment_method not in VALID_PAYMENT_METHODS:
        payment_method = "BANK_TRANSFER"

    # Status logic:
    # Customers submitting offline payments cannot mark them as verified.
    is_online = (payment_method == "ONLINE_MOCK_SIMULATED")
    if g.current_user.role == "CUSTOMER":
        if is_online:
            initial_status = "CONFIRMED"
        else:
            initial_status = "PENDING_VERIFICATION"
    else:
        # Staff or Admin
        verified_flag = data.get("verified_by_staff", True)
        initial_status = "CONFIRMED" if verified_flag else "PENDING_VERIFICATION"

    # Generate payment number
    pay_count = Payment.query.count() + 1
    pay_number = f"PAY-{date.today().year}-{pay_count:05d}"
    while Payment.query.filter_by(payment_number=pay_number).first():
        pay_count += 1
        pay_number = f"PAY-{date.today().year}-{pay_count:05d}"

    txn_ref = data.get("transaction_reference")
    if not txn_ref:
        prefix = "SIM-TXN" if is_online else "REF"
        txn_ref = f"{prefix}-{uuid.uuid4().hex[:8].upper()}"

    payment = Payment(
        id=uuid.uuid4(),
        payment_number=pay_number,
        invoice_id=invoice.id,
        customer_id=invoice.customer_id,
        recorded_by=g.current_user.id if g.current_user.role in ("ADMIN", "STAFF") else None,
        amount=amount,
        payment_method=payment_method,
        payment_status=initial_status,
        transaction_reference=txn_ref,
        notes=(data.get("notes") or "").strip() or None
    )
    app.db.db_session.add(payment)

    # Reconcile invoice if payment is CONFIRMED immediately
    if initial_status == "CONFIRMED":
        invoice.amount_paid = quantize_money(invoice.amount_paid + amount)
        invoice.balance_due = max(Decimal("0.00"), quantize_money(invoice.balance_due - amount))
        if invoice.balance_due == Decimal("0.00"):
            invoice.status = "PAID"
        else:
            invoice.status = "PARTIALLY_PAID"

    try:
        app.db.db_session.commit()
    except Exception as e:
        app.db.db_session.rollback()
        return jsonify({
            "success": False,
            "error": "Database error recording payment.",
            "code": "DB_ERROR",
            "details": str(e)
        }), 500

    return jsonify({
        "success": True,
        "payment": payment.to_dict(),
        "data": {
            "payment": payment.to_dict()
        }
    }), 201


@payment_bp.route("/<uuid:payment_id>/verify", methods=["POST"])
@login_required
@role_required(["ADMIN", "STAFF"])
def verify_payment(payment_id):
    """
    Admin / Staff: Verify an offline payment that was in PENDING_VERIFICATION status.
    Applies the payment amount to the associated invoice and updates its balance and status.
    """
    payment = Payment.query.filter_by(id=payment_id).first()
    if not payment:
        return jsonify({
            "success": False,
            "error": "Payment not found.",
            "code": "PAYMENT_NOT_FOUND"
        }), 404

    if payment.payment_status == "CONFIRMED":
        return jsonify({
            "success": False,
            "error": "Payment has already been verified.",
            "code": "ALREADY_VERIFIED"
        }), 400

    payment.payment_status = "CONFIRMED"
    payment.recorded_by = g.current_user.id

    invoice = payment.invoice
    if invoice:
        invoice.amount_paid = quantize_money(invoice.amount_paid + payment.amount)
        invoice.balance_due = max(Decimal("0.00"), quantize_money(invoice.balance_due - payment.amount))
        if invoice.balance_due == Decimal("0.00"):
            invoice.status = "PAID"
        else:
            invoice.status = "PARTIALLY_PAID"

    try:
        app.db.db_session.commit()
    except Exception as e:
        app.db.db_session.rollback()
        return jsonify({
            "success": False,
            "error": "Database error verifying payment.",
            "code": "DB_ERROR"
        }), 500

    return jsonify({
        "success": True,
        "message": "Payment verified successfully.",
        "payment": payment.to_dict(),
        "data": {
            "payment": payment.to_dict()
        }
    }), 200
