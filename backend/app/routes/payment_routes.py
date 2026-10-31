import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from flask import Blueprint, request, jsonify, g
from app.db import db_session
from app.models.payment import Payment
from app.models.invoice import Invoice
from app.utils.security import login_required, role_required
from app.utils.financial import quantize_money

payment_bp = Blueprint("payments", __name__, url_prefix="/api/payments")

@payment_bp.route("", methods=["GET"])
@login_required
def list_payments():
    """
    List payment records.
    - If CUSTOMER: strictly scoped to g.current_user.id
    - If ADMIN or STAFF: can view all or filter by customer_id or status
    """
    query = Payment.query

    if g.current_user.role == "CUSTOMER":
        query = query.filter(Payment.customer_id == g.current_user.id)
    else:
        cust_id = request.args.get("customer_id")
        if cust_id:
            try:
                query = query.filter(Payment.customer_id == uuid.UUID(str(cust_id)))
            except (ValueError, TypeError):
                pass

    status = request.args.get("status")
    if status and status.upper() != "ALL":
        query = query.filter(Payment.payment_status == status.upper())

    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Payment.payment_number.ilike(search_pattern)) |
            (Payment.transaction_reference.ilike(search_pattern))
        )

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


@payment_bp.route("", methods=["POST"])
@login_required
def record_payment():
    """
    Record a new payment for an invoice.
    Rules:
    - Customers can only record payments for their own invoices.
    - Simulated online payments (payment_method == 'ONLINE_MOCK_SIMULATED') are immediately confirmed.
    - Offline payments (BANK_TRANSFER, CASH, CHEQUE) recorded by customers remain 'PENDING_VERIFICATION' until verified by staff.
    - Payments recorded by ADMIN or STAFF are immediately 'CONFIRMED'.
    """
    data = request.get_json() or {}
    invoice_id_raw = data.get("invoice_id")
    amount_raw = data.get("amount")
    payment_method = (data.get("payment_method") or "BANK_TRANSFER").strip()
    transaction_ref = (data.get("transaction_reference") or "").strip() or None
    notes = (data.get("notes") or "").strip() or None

    if not invoice_id_raw or amount_raw is None:
        return jsonify({
            "success": False,
            "error": "invoice_id and amount are required.",
            "code": "MISSING_REQUIRED_FIELDS"
        }), 400

    try:
        invoice_id = uuid.UUID(str(invoice_id_raw))
        amount = quantize_money(amount_raw)
        if amount <= Decimal("0.00"):
            return jsonify({
                "success": False,
                "error": "Payment amount must be greater than zero.",
                "code": "INVALID_AMOUNT"
            }), 400

        invoice = Invoice.query.filter_by(id=invoice_id).first()
        if not invoice:
            return jsonify({
                "success": False,
                "error": "Invoice not found.",
                "code": "INVOICE_NOT_FOUND"
            }), 404

        # Access check for CUSTOMER
        if g.current_user.role == "CUSTOMER" and invoice.customer_id != g.current_user.id:
            return jsonify({
                "success": False,
                "error": "Access denied.",
                "code": "FORBIDDEN"
            }), 403

        if amount > invoice.balance_due:
            return jsonify({
                "success": False,
                "error": f"Payment amount ({amount}) cannot exceed invoice balance due ({invoice.balance_due}).",
                "code": "EXCEEDS_BALANCE"
            }), 400

        # Determine verification status
        is_staff_or_admin = g.current_user.role in ("ADMIN", "STAFF")
        is_simulated_online = payment_method == "ONLINE_MOCK_SIMULATED"

        if is_staff_or_admin or is_simulated_online:
            payment_status = "CONFIRMED"
            recorded_by = g.current_user.id if is_staff_or_admin else None
        else:
            # Customer submitted an offline bank transfer/cheque -> needs staff verification
            payment_status = "PENDING_VERIFICATION"
            recorded_by = None

        pay_count = Payment.query.count() + 1
        payment_number = f"PAY-{date.today().year}-{pay_count:05d}"

        payment = Payment(
            id=uuid.uuid4(),
            payment_number=payment_number,
            invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            recorded_by=recorded_by,
            amount=amount,
            payment_method=payment_method,
            payment_status=payment_status,
            transaction_reference=transaction_ref,
            payment_date=datetime.now(timezone.utc),
            notes=notes
        )
        db_session.add(payment)

        # If payment is immediately confirmed, apply to invoice
        if payment_status == "CONFIRMED":
            invoice.amount_paid = quantize_money(invoice.amount_paid + amount)
            invoice.balance_due = quantize_money(max(Decimal("0.00"), invoice.total_amount - invoice.amount_paid))
            if invoice.balance_due <= Decimal("0.00"):
                invoice.status = "PAID"
            elif invoice.amount_paid > Decimal("0.00"):
                invoice.status = "PARTIALLY_PAID"

        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Payment recorded successfully." if payment_status == "CONFIRMED" else "Payment submitted and pending staff verification.",
            "payment": payment.to_dict(),
            "data": {
                "payment": payment.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "code": "SERVER_ERROR"
        }), 500


@payment_bp.route("/<uuid:payment_id>/verify", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def verify_payment(payment_id):
    """
    Staff / Admin verifies an offline payment submitted by a customer.
    Applies the payment to the invoice and updates balances.
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
            "error": "Payment is already verified and confirmed.",
            "code": "ALREADY_CONFIRMED"
        }), 400

    try:
        payment.payment_status = "CONFIRMED"
        payment.recorded_by = g.current_user.id

        # Update invoice
        invoice = payment.invoice
        if invoice:
            invoice.amount_paid = quantize_money(invoice.amount_paid + payment.amount)
            invoice.balance_due = quantize_money(max(Decimal("0.00"), invoice.total_amount - invoice.amount_paid))
            if invoice.balance_due <= Decimal("0.00"):
                invoice.status = "PAID"
            elif invoice.amount_paid > Decimal("0.00"):
                invoice.status = "PARTIALLY_PAID"

        db_session.commit()

        return jsonify({
            "success": True,
            "message": f"Payment {payment.payment_number} successfully verified.",
            "payment": payment.to_dict(),
            "data": {
                "payment": payment.to_dict()
            }
        }), 200

    except Exception as e:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": str(e),
            "code": "SERVER_ERROR"
        }), 500
