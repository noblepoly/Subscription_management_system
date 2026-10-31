/**
 * High-fidelity temporary mock dataset matching backend PostgreSQL models.
 * Completely decoupled and isolated for seamless removal when backend routes are active.
 */

export const initialUsers = [
  {
    id: "u-1",
    email: "admin@brightloop.io",
    full_name: "Alex Mercer",
    company_name: "Brightloop Systems Inc.",
    role: "ADMIN",
    phone: "+1 (555) 019-2834",
    billing_address: "100 Market St, Suite 400, San Francisco, CA",
    is_active: true,
    created_at: "2026-01-10T09:00:00Z"
  },
  {
    id: "u-2",
    email: "staff@brightloop.io",
    full_name: "Samantha Ray",
    company_name: "Brightloop Operations",
    role: "STAFF",
    phone: "+1 (555) 014-9921",
    billing_address: "100 Market St, San Francisco, CA",
    is_active: true,
    created_at: "2026-01-15T11:20:00Z"
  },
  {
    id: "u-3",
    email: "sarah.connor@cyberdyne.io",
    full_name: "Sarah Connor",
    company_name: "Cyberdyne Systems",
    role: "CUSTOMER",
    phone: "+1 (555) 349-2041",
    billing_address: "100 Tech Blvd, Silicon Valley, CA 94025",
    is_active: true,
    created_at: "2026-02-01T14:30:00Z"
  },
  {
    id: "u-4",
    email: "john.doe@startup.io",
    full_name: "John Doe",
    company_name: "Startup Dynamics",
    role: "CUSTOMER",
    phone: "+1 (555) 782-1100",
    billing_address: "45 Innovation Way, Austin, TX 78701",
    is_active: true,
    created_at: "2026-02-12T10:15:00Z"
  }
];

export const initialProducts = [
  {
    id: "prod-1",
    name: "Brightloop Cloud CRM",
    product_type: "SOFTWARE",
    sales_price: 99.00,
    cost_price: 20.00,
    description: "Cloud-native CRM and subscription management suite.",
    notes: "Core SaaS offering",
    is_active: true,
    variants: [
      { id: "v-1", product_id: "prod-1", variant_name: "Starter (5 Users)", sku: "CRM-STR", additional_price: 0.00, is_active: true },
      { id: "v-2", product_id: "prod-1", variant_name: "Professional (25 Users)", sku: "CRM-PRO", additional_price: 50.00, is_active: true },
      { id: "v-3", product_id: "prod-1", variant_name: "Enterprise (Unlimited)", sku: "CRM-ENT", additional_price: 150.00, is_active: true }
    ]
  },
  {
    id: "prod-2",
    name: "24/7 Priority Support SLA",
    product_type: "SERVICE",
    sales_price: 49.00,
    cost_price: 10.00,
    description: "Dedicated account manager with guaranteed 15-minute response SLA.",
    notes: "Service add-on",
    is_active: true,
    variants: []
  },
  {
    id: "prod-3",
    name: "Secure IoT Telemetry Gateway",
    product_type: "PHYSICAL",
    sales_price: 299.00,
    cost_price: 150.00,
    description: "Hardware appliance for edge data sync.",
    notes: "Physical hardware",
    is_active: true,
    variants: []
  }
];

export const initialPlans = [
  {
    id: "plan-1",
    name: "Standard Monthly Plan",
    billing_interval: "MONTHLY",
    interval_count: 1,
    minimum_quantity: 1,
    base_price: 99.00,
    available_from: "2026-01-01",
    available_to: null,
    auto_close: false,
    auto_close_days: 0,
    is_active: true
  },
  {
    id: "plan-2",
    name: "Quarterly Growth Plan",
    billing_interval: "MONTHLY",
    interval_count: 3,
    minimum_quantity: 1,
    base_price: 270.00,
    available_from: "2026-01-01",
    available_to: null,
    auto_close: false,
    auto_close_days: 0,
    is_active: true
  },
  {
    id: "plan-3",
    name: "Enterprise Annual Plan",
    billing_interval: "YEARLY",
    interval_count: 1,
    minimum_quantity: 1,
    base_price: 999.00,
    available_from: "2026-01-01",
    available_to: null,
    auto_close: true,
    auto_close_days: 365,
    is_active: true
  },
  {
    id: "plan-4",
    name: "Weekly Sprint Plan",
    billing_interval: "WEEKLY",
    interval_count: 1,
    minimum_quantity: 1,
    base_price: 35.00,
    available_from: "2026-01-01",
    available_to: null,
    auto_close: false,
    auto_close_days: 0,
    is_active: true
  }
];

export const initialTaxRates = [
  { id: "tax-1", name: "GST 18%", rate_percentage: 18.0, is_active: true },
  { id: "tax-2", name: "Standard VAT 10%", rate_percentage: 10.0, is_active: true },
  { id: "tax-3", name: "Zero Tax (Export)", rate_percentage: 0.0, is_active: true }
];

export const initialDiscounts = [
  {
    id: "disc-1",
    code: "WELCOME10",
    description: "10% off initial subscription billing",
    discount_type: "PERCENTAGE",
    discount_value: 10.00,
    scope: "SUBSCRIPTION",
    min_purchase_amount: 50.00,
    min_quantity: 1,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    usage_limit: 100,
    times_used: 14,
    is_active: true,
    applicable_product_ids: []
  },
  {
    id: "disc-2",
    code: "FLAT50",
    description: "$50 off enterprise orders",
    discount_type: "FIXED",
    discount_value: 50.00,
    scope: "SUBSCRIPTION",
    min_purchase_amount: 200.00,
    min_quantity: 1,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    usage_limit: 50,
    times_used: 8,
    is_active: true,
    applicable_product_ids: []
  },
  {
    id: "disc-3",
    code: "EXPIRED20",
    description: "Expired promotional coupon",
    discount_type: "PERCENTAGE",
    discount_value: 20.00,
    scope: "SUBSCRIPTION",
    min_purchase_amount: 50.00,
    min_quantity: 1,
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    usage_limit: 10,
    times_used: 10,
    is_active: false,
    applicable_product_ids: []
  }
];

export const initialQuotations = [
  {
    id: "quot-1",
    name: "Enterprise CRM + SLA Bundle",
    description: "Quotation for Cyberdyne high-availability infrastructure",
    plan_id: "plan-1",
    plan_name: "Standard Monthly Plan",
    default_validity_days: 30,
    terms_and_conditions: "Standard 30-day net billing. SLA guaranteed 99.9% uptime.",
    is_active: true,
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    total_estimated: 148.00,
    created_at: "2026-02-10T10:00:00Z",
    items: [
      {
        id: "qi-1",
        product_id: "prod-1",
        product_name: "Brightloop Cloud CRM",
        variant_id: "v-2",
        variant_name: "Professional (25 Users)",
        quantity: 1,
        unit_price: 99.00,
        additional_price: 50.00,
        line_total: 149.00
      }
    ]
  }
];

export const initialSubscriptions = [
  {
    id: "sub-101",
    subscription_number: "SUB-2026-00001",
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    customer_email: "sarah.connor@cyberdyne.io",
    plan_id: "plan-1",
    plan_name: "Standard Monthly Plan",
    billing_interval: "MONTHLY",
    interval_count: 1,
    status: "ACTIVE",
    start_date: "2026-01-15T00:00:00Z",
    expiry_date: "2027-01-15T00:00:00Z",
    next_billing_date: "2026-03-15T00:00:00Z",
    last_billed_date: "2026-02-15T00:00:00Z",
    paused_at: null,
    closed_at: null,
    closure_reason: null,
    subtotal: 149.00,
    discount_amount: 14.90,
    tax_amount: 24.14,
    recurring_total: 158.24,
    notes: "Cyberdyne core subscription",
    created_at: "2026-01-15T10:00:00Z",
    items: [
      {
        id: "si-1",
        product_id: "prod-1",
        product_name: "Brightloop Cloud CRM",
        variant_id: "v-2",
        variant_name: "Professional (25 Users)",
        quantity: 1,
        unit_price: 99.00,
        additional_price: 50.00,
        line_total: 149.00
      }
    ]
  },
  {
    id: "sub-102",
    subscription_number: "SUB-2026-00002",
    customer_id: "u-4",
    customer_name: "John Doe",
    customer_email: "john.doe@startup.io",
    plan_id: "plan-2",
    plan_name: "Quarterly Growth Plan",
    billing_interval: "MONTHLY",
    interval_count: 3,
    status: "ACTIVE",
    start_date: "2026-02-01T00:00:00Z",
    expiry_date: "2027-02-01T00:00:00Z",
    next_billing_date: "2026-05-01T00:00:00Z",
    last_billed_date: "2026-02-01T00:00:00Z",
    subtotal: 3000.00,
    discount_amount: 0.00,
    tax_amount: 540.00,
    recurring_total: 3540.00,
    notes: "Startup Dynamics 3-month cycle ($3000/3mo = $1000 MRR)",
    created_at: "2026-02-01T12:00:00Z",
    items: [
      {
        id: "si-2",
        product_id: "prod-1",
        product_name: "Brightloop Cloud CRM",
        variant_id: "v-3",
        variant_name: "Enterprise (Unlimited)",
        quantity: 2,
        unit_price: 99.00,
        additional_price: 150.00,
        line_total: 498.00
      }
    ]
  },
  {
    id: "sub-103",
    subscription_number: "SUB-2026-00003",
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    customer_email: "sarah.connor@cyberdyne.io",
    plan_id: "plan-4",
    plan_name: "Weekly Sprint Plan",
    billing_interval: "WEEKLY",
    interval_count: 1,
    status: "PAUSED",
    start_date: "2026-01-20T00:00:00Z",
    expiry_date: null,
    next_billing_date: "2026-03-01T00:00:00Z",
    paused_at: "2026-02-14T09:00:00Z",
    subtotal: 84.00,
    discount_amount: 0.00,
    tax_amount: 15.12,
    recurring_total: 99.12,
    notes: "Temporarily paused by client",
    created_at: "2026-01-20T08:00:00Z",
    items: [
      {
        id: "si-3",
        product_id: "prod-2",
        product_name: "24/7 Priority Support SLA",
        quantity: 1,
        unit_price: 49.00,
        additional_price: 35.00,
        line_total: 84.00
      }
    ]
  }
];

export const initialInvoices = [
  {
    id: "inv-101",
    invoice_number: "INV-2026-00001",
    subscription_id: "sub-101",
    subscription_number: "SUB-2026-00001",
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    customer_email: "sarah.connor@cyberdyne.io",
    status: "PAID",
    billing_period_start: "2026-01-15",
    billing_period_end: "2026-02-15",
    invoice_date: "2026-01-15",
    due_date: "2026-01-29",
    subtotal: 149.00,
    discount_amount: 14.90,
    tax_amount: 24.14,
    total_amount: 158.24,
    amount_paid: 158.24,
    balance_due: 0.00,
    notes: "Recurring billing Jan 15 - Feb 15",
    created_at: "2026-01-15T00:00:00Z",
    items: [
      {
        id: "ii-1",
        product_name: "Brightloop Cloud CRM",
        variant_name: "Professional (25 Users)",
        quantity: 1,
        applied_unit_price: 99.00,
        applied_additional_price: 50.00,
        discount_allocation: 14.90,
        tax_rate: 18.0,
        tax_amount: 24.14,
        line_total: 149.00
      }
    ]
  },
  {
    id: "inv-102",
    invoice_number: "INV-2026-00002",
    subscription_id: "sub-101",
    subscription_number: "SUB-2026-00001",
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    customer_email: "sarah.connor@cyberdyne.io",
    status: "PARTIALLY_PAID",
    billing_period_start: "2026-02-15",
    billing_period_end: "2026-03-15",
    invoice_date: "2026-02-15",
    due_date: "2026-03-01",
    subtotal: 149.00,
    discount_amount: 14.90,
    tax_amount: 24.14,
    total_amount: 158.24,
    amount_paid: 80.00,
    balance_due: 78.24,
    notes: "Recurring billing Feb 15 - Mar 15",
    created_at: "2026-02-15T00:00:00Z",
    items: [
      {
        id: "ii-2",
        product_name: "Brightloop Cloud CRM",
        variant_name: "Professional (25 Users)",
        quantity: 1,
        applied_unit_price: 99.00,
        applied_additional_price: 50.00,
        discount_allocation: 14.90,
        tax_rate: 18.0,
        tax_amount: 24.14,
        line_total: 149.00
      }
    ]
  },
  {
    id: "inv-103",
    invoice_number: "INV-2026-00003",
    subscription_id: "sub-102",
    subscription_number: "SUB-2026-00002",
    customer_id: "u-4",
    customer_name: "John Doe",
    customer_email: "john.doe@startup.io",
    status: "OVERDUE",
    billing_period_start: "2026-01-01",
    billing_period_end: "2026-04-01",
    invoice_date: "2026-01-01",
    due_date: "2026-01-15",
    subtotal: 3000.00,
    discount_amount: 0.00,
    tax_amount: 540.00,
    total_amount: 3540.00,
    amount_paid: 1000.00,
    balance_due: 2540.00,
    notes: "Quarterly billing (Overdue balance)",
    created_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "ii-3",
        product_name: "Brightloop Cloud CRM",
        variant_name: "Enterprise (Unlimited)",
        quantity: 2,
        applied_unit_price: 99.00,
        applied_additional_price: 150.00,
        discount_allocation: 0.00,
        tax_rate: 18.0,
        tax_amount: 540.00,
        line_total: 3000.00
      }
    ]
  }
];

export const initialPayments = [
  {
    id: "pay-1",
    payment_number: "PAY-2026-00001",
    invoice_id: "inv-101",
    invoice_number: "INV-2026-00001",
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    recorded_by: "u-2",
    recorder_name: "Samantha Ray (Staff)",
    amount: 158.24,
    payment_method: "BANK_TRANSFER",
    payment_status: "CONFIRMED",
    transaction_reference: "WIRE-CYBER-88392",
    payment_date: "2026-01-20T14:22:00Z",
    notes: "Verified against bank statement"
  },
  {
    id: "pay-2",
    payment_number: "PAY-2026-00002",
    invoice_id: "inv-102",
    invoice_number: "INV-2026-00002",
    customer_id: "u-3",
    customer_name: "Sarah Connor",
    recorded_by: null,
    recorder_name: "System / Online Simulation",
    amount: 80.00,
    payment_method: "ONLINE_MOCK_SIMULATED",
    payment_status: "CONFIRMED",
    transaction_reference: "SIM-TXN-49102",
    payment_date: "2026-02-18T16:05:00Z",
    notes: "Simulated online installment"
  },
  {
    id: "pay-3",
    payment_number: "PAY-2026-00003",
    invoice_id: "inv-103",
    invoice_number: "INV-2026-00003",
    customer_id: "u-4",
    customer_name: "John Doe",
    recorded_by: "u-2",
    recorder_name: "Samantha Ray (Staff)",
    amount: 1000.00,
    payment_method: "CHEQUE",
    payment_status: "PENDING_VERIFICATION",
    transaction_reference: "CHQ-991204",
    payment_date: "2026-01-14T11:40:00Z",
    notes: "Cheque received; clearing pending"
  }
];
