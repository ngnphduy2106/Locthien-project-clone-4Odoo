/**
 * Schema payload Odoo gửi qua webhook và trả về từ
 * `odooClient.getOrderDetail(id)`. Dùng làm tài liệu — không runtime check.
 *
 * @typedef {Object} OdooPartner
 * @property {number} id
 * @property {string} name
 * @property {string} [vat]
 * @property {string} [phone]
 * @property {string} [mobile]
 * @property {string} [email]
 *
 * @typedef {Object} OdooShipping
 * @property {number} id
 * @property {string} name
 * @property {string} [phone]
 * @property {string} [mobile]
 * @property {string} [street]
 * @property {string} [street2]
 * @property {string} [city]
 * @property {string} [state]
 *
 * @typedef {Object} OdooLine
 * @property {number} id
 * @property {number} sequence
 * @property {number} product_id
 * @property {string} [product_code]
 * @property {string} product_name
 * @property {string} [description]
 * @property {number} qty
 * @property {string} uom
 * @property {number} price_unit
 * @property {number} discount       Chiết khấu % (0..100)
 * @property {number} price_subtotal
 * @property {number} price_total
 * @property {string} [taxes]        Tên các thuế áp dụng — ghép bằng dấu phẩy
 * @property {string} [quy_cach]
 * @property {string} [ma_quy_cach]
 * @property {number} [cong_bom]     Phụ thu công bơm/đơn vị
 * @property {number} [vo_can]       Phụ thu vỏ can/đơn vị
 *
 * @typedef {Object} OdooWebhookPayload
 * @property {string} event              order.ready_for_dispatch | order.delivery_started | order.delivered
 * @property {number} order_id
 * @property {string} order_name
 * @property {boolean} is_quotation
 * @property {OdooPartner} partner
 * @property {OdooShipping} shipping
 * @property {number} amount_untaxed
 * @property {number} amount_tax
 * @property {number} amount_total
 * @property {number} [x_phi_phu_thu]    Tổng phụ thu (chỉ tham khảo)
 * @property {string} currency
 * @property {string} x_lt_status
 * @property {string} [x_lt_driver_name]
 * @property {string} [x_lt_plate]
 * @property {string} date_order
 * @property {string} [commitment_date]
 * @property {string} [payment_term]
 * @property {string} [note]
 * @property {OdooLine[]} lines
 * @property {string} timestamp
 */

export {};
