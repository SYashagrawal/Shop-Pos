'use strict';
/* =====================================================================
   SHOP POS - GST tax invoice (PDF), made in the browser with jsPDF
   ===================================================================== */

function numberToWordsIN(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
  const three = (n) => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
  const toWords = (n) => {
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(three(crore) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (thousand) parts.push(two(thousand) + ' Thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const total = Math.round(Number(num) * 100);
  const rupees = Math.floor(total / 100); const paise = total % 100;
  let s = 'Rupees ' + toWords(rupees);
  if (paise) s += ' and ' + two(paise) + ' Paise';
  return s + ' Only';
}

function makeInvoicePDF(o, settings) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const M = 12; const R = W - M;
  const f = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const BLUE = [37, 99, 235]; const DARK = [22, 32, 46]; const GREY = [107, 119, 140];
  const c = o.customer_snapshot || {};
  const intra = Number(o.igst) === 0;

  /* ---- header ---- */
  doc.setFillColor(...BLUE); doc.rect(0, 0, W, 4, 'F');
  doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(settings.shop_name || 'Shop Pos', M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
  let y = 21;
  const addr = doc.splitTextToSize(settings.address || '', 105);
  addr.forEach((ln) => { doc.text(ln, M, y); y += 4; });
  const contact = [settings.phone ? 'Phone: ' + settings.phone : '', settings.email ? 'Email: ' + settings.email : ''].filter(Boolean).join('   ');
  if (contact) { doc.text(contact, M, y); y += 4; }
  if (settings.gstin) { doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text('GSTIN: ' + settings.gstin, M, y); y += 4; }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...BLUE);
  doc.text('TAX INVOICE', R, 16, { align: 'right' });
  doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Invoice No: ' + o.bill_no, R, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('Date: ' + date(o.created_at), R, 26.5, { align: 'right' });
  doc.text('Outlet: ' + (o.outlets?.name || ''), R, 31, { align: 'right' });

  y = Math.max(y, 35) + 2;
  doc.setDrawColor(220, 226, 236); doc.line(M, y, R, y); y += 5;

  /* ---- bill to / payment ---- */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text('BILL TO', M, y); doc.text('PAYMENT', 125, y);
  y += 4.5;
  doc.setFontSize(10); doc.setTextColor(...DARK);
  const billName = c.type === 'RD' && c.business_name ? c.business_name : c.name;
  doc.text(billName || '', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let by = y + 4.5;
  if (c.type === 'RD' && c.business_name && c.business_name !== c.name) { doc.text('Contact: ' + c.name, M, by); by += 4; }
  if (c.phone) { doc.text('Phone: ' + c.phone, M, by); by += 4; }
  if (c.type === 'RD') {
    if (c.gstin) { doc.text('GSTIN: ' + c.gstin, M, by); by += 4; }
    doc.splitTextToSize(c.address || '', 100).forEach((ln) => { doc.text(ln, M, by); by += 4; });
    if (c.state) { doc.text('State: ' + c.state, M, by); by += 4; }
  } else { doc.text('Unregistered customer', M, by); by += 4; }

  const modes = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit' };
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(modes[o.payment_mode] || o.payment_mode, 125, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let py = y + 4.5;
  if (o.payment_mode === 'credit') {
    doc.text('Credit period: ' + o.credit_days + ' days', 125, py); py += 4;
    doc.text('Due date: ' + date(o.due_date), 125, py); py += 4;
    doc.text('Status: ' + (o.payment_status === 'paid' ? 'Paid' : 'Payment pending'), 125, py); py += 4;
  } else { doc.text('Status: Paid', 125, py); py += 4; }
  doc.text('Place of supply: ' + (c.type === 'RD' && c.state ? c.state : (settings.state || '')), 125, py); py += 4;
  if (o.profiles?.full_name) { doc.text('Billed by: ' + o.profiles.full_name, 125, py); py += 4; }

  y = Math.max(by, py) + 3;

  /* ---- items ---- */
  const hasDisc = o.order_items.some((i) => Number(i.discount) > 0);
  const head = ['#', 'Item / HSN', 'Qty', 'Rate (incl. GST)', ...(hasDisc ? ['Discount'] : []), 'Taxable', 'GST %', 'GST amt', 'Amount'];
  const body = o.order_items.map((i, n) => [
    n + 1, i.name + (i.hsn ? '\nHSN: ' + i.hsn : ''), i.qty, f(i.unit_price), ...(hasDisc ? [f(i.discount)] : []),
    f(i.taxable), Number(i.gst_rate) + '%', f(i.tax), f(i.line_total),
  ]);
  const num = { halign: 'right' };
  doc.autoTable({
    startY: y, head: [head], body, theme: 'grid', margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, lineColor: [220, 226, 236], lineWidth: 0.2, textColor: DARK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'center', cellWidth: 11 }, 3: num, ...(hasDisc ? { 4: num, 5: num, 6: { halign: 'center' }, 7: num, 8: num } : { 4: num, 5: { halign: 'center' }, 6: num, 7: num }) },
  });
  y = doc.lastAutoTable.finalY + 5;
  if (y > 225) { doc.addPage(); y = 20; }

  /* ---- GST summary (left) ---- */
  const byRate = {};
  o.order_items.forEach((i) => {
    const k = Number(i.gst_rate);
    byRate[k] = byRate[k] || { taxable: 0, tax: 0 };
    byRate[k].taxable += Number(i.taxable); byRate[k].tax += Number(i.tax);
  });
  const sumRows = Object.keys(byRate).sort((a, b) => a - b).map((k) => {
    const r = byRate[k];
    return intra ? [k + '%', f(r.taxable), f(Math.round(r.tax * 50) / 100), f(r.tax - Math.round(r.tax * 50) / 100), f(r.tax)] : [k + '%', f(r.taxable), f(r.tax), f(r.tax)];
  });
  doc.autoTable({
    startY: y, margin: { left: M, right: W - 108 }, tableWidth: 96, theme: 'grid',
    head: [intra ? ['GST %', 'Taxable', 'CGST', 'SGST', 'Total tax'] : ['GST %', 'Taxable', 'IGST', 'Total tax']], body: sumRows,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, lineColor: [220, 226, 236], lineWidth: 0.2, textColor: DARK },
    headStyles: { fillColor: [238, 241, 246], textColor: DARK, fontStyle: 'bold' },
    columnStyles: { 1: num, 2: num, 3: num, 4: num },
  });
  const leftEnd = doc.lastAutoTable.finalY;

  /* ---- totals (right) ---- */
  let ty = y + 3; const lx = 118;
  const line = (label, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9); doc.setTextColor(...DARK);
    doc.text(label, lx, ty); doc.text(val, R, ty, { align: 'right' }); ty += bold ? 7 : 5;
  };
  line('Amount (incl. GST)', 'Rs. ' + f(o.gross_total));
  if (Number(o.discount) > 0) line('Discount', '- Rs. ' + f(o.discount));
  line('Taxable value', 'Rs. ' + f(o.taxable_value));
  if (intra) { line('CGST', 'Rs. ' + f(o.cgst)); line('SGST', 'Rs. ' + f(o.sgst)); } else { line('IGST', 'Rs. ' + f(o.igst)); }
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.5); doc.line(lx, ty - 2.5, R, ty - 2.5); ty += 1;
  line('TOTAL', 'Rs. ' + f(o.total), true);

  y = Math.max(leftEnd, ty) + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
  doc.text('Amount in words:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.splitTextToSize(numberToWordsIN(o.total), R - M - 32).forEach((ln, i) => doc.text(ln, M + 30, y + i * 4));
  y += 9;

  /* ---- bank / terms / signature ---- */
  if (y > 245) { doc.addPage(); y = 20; }
  if (settings.bank_details) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('Bank details', M, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.splitTextToSize(settings.bank_details, 100).forEach((ln) => { doc.text(ln, M, y); y += 3.8; });
    y += 2;
  }
  if (o.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('Note: ' + o.notes, M, y); y += 5; }
  if (settings.terms) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('Terms & conditions', M, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
    doc.splitTextToSize(settings.terms, 110).forEach((ln) => { doc.text(ln, M, y); y += 3.6; });
  }
  const sy = Math.max(y, 262);
  doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('For ' + (settings.shop_name || 'Shop Pos'), R, sy - 14, { align: 'right' });
  doc.setDrawColor(150, 160, 175); doc.setLineWidth(0.2); doc.line(R - 55, sy - 2, R, sy - 2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('Authorised signatory', R, sy + 2, { align: 'right' });
  doc.setTextColor(...GREY); doc.setFontSize(7.5);
  doc.text('This is a computer generated invoice.', W / 2, 290, { align: 'center' });

  /* ---- cancelled watermark on every page ---- */
  if (o.status === 'cancelled') {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); doc.setTextColor(245, 190, 186); doc.setFont('helvetica', 'bold'); doc.setFontSize(64);
      doc.text('CANCELLED', 40, 190, { angle: 30 });
    }
  }
  return doc;
}
