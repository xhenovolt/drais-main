import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

interface PaymentData {
  id: number;
  receipt_no: string;
  amount: number;
  discount_applied: number;
  tax_amount: number;
  method: string;
  paid_by: string;
  payer_contact: string;
  created_at: string;
  student_name: string;
  admission_no: string;
  class_name: string;
  term_name: string;
  currency: string;
  school_name: string;
  legal_name?: string;
  school_address?: string;
  school_phone?: string;
  school_email?: string;
  logo_url?: string;
  receipt_metadata?: Record<string, unknown>;
}

/**
 * True when two school names are the same name to a reader, so the second one
 * should not be printed. Exact comparison is not enough: a school's `name` and
 * `legal_name` routinely differ only by capitalisation, punctuation, or a
 * typo, and printing both makes the receipt look duplicated.
 */
function isEffectivelySameName(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;

  // Allow a few characters of difference on a long name — "nursary" vs
  // "nursery" is a typo, not a different legal entity.
  const [long, short] = x.length >= y.length ? [x, y] : [y, x];
  if (long.length - short.length > 3) return false;

  let edits = 0;
  for (let i = 0, j = 0; i < long.length; i++, j++) {
    if (long[i] === short[j]) continue;
    if (++edits > Math.max(2, Math.floor(long.length * 0.1))) return false;
    // Treat it as a substitution unless skipping one char in the longer
    // string realigns them (an insertion).
    if (long[i + 1] === short[j]) j--;
  }
  return true;
}

/** Money on a receipt must be grouped. mysql2 returns DECIMAL as a string, and
 *  `"36000.00".toLocaleString()` is a no-op — which is why amounts printed
 *  unseparated. Coerce first, then format. */
function money(currency: string, value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${currency} ${String(value ?? '0')}`;
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export async function generateReceiptPDF(paymentData: PaymentData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // ── Header ───────────────────────────────────────────────────────────
      // Everything below y=150 in this document is absolutely positioned, so
      // the header must never grow past that line. It previously drew each
      // line at a FIXED y (50 / 75 / 95 / 110) while the school name was free
      // to wrap: a 60-character name at 20pt takes three lines and ran
      // straight through the legal name and the address, which is the overlap
      // on Albayan's receipts. The name is now fitted into a fixed budget by
      // stepping the font down, and each following line flows from where the
      // previous one actually ended.
      const HEADER_TOP = 50;
      const HEADER_BOTTOM = 140;          // 10pt of air before 'PAYMENT RECEIPT' at 150
      const HEADER_WIDTH = doc.page.width - 100;   // both 50pt margins

      const schoolName = (paymentData.school_name || 'School').trim();

      // Largest size at which the name fits half the header budget, so there
      // is always room for the address beneath it.
      let nameSize = 20;
      while (
        nameSize > 11 &&
        doc.fontSize(nameSize).heightOfString(schoolName, { width: HEADER_WIDTH }) > 46
      ) nameSize -= 1;

      doc.fontSize(nameSize).text(schoolName, 50, HEADER_TOP, { width: HEADER_WIDTH });

      /** Draws one more header line if there is still vertical room for it. */
      const headerLine = (text: string | null | undefined, size: number) => {
        if (!text) return;
        const y = doc.y + 2;
        if (y + size + 2 > HEADER_BOTTOM) return;   // silently drop rather than collide
        doc.fontSize(size).text(String(text).trim(), 50, y, { width: HEADER_WIDTH });
      };

      // The legal name is printed only when it genuinely differs. Albayan's
      // reads "ALBAYAN QURAN MEMORIZATION CENTRE NURSARY AND PRIMARY SCHOOL"
      // and "Albayan Quran Memorization Centre Nursery and Primary School" —
      // the same name in different case with one spelling slip, so an exact
      // comparison misses it and the receipt showed the school twice.
      if (!isEffectivelySameName(schoolName, paymentData.legal_name)) {
        headerLine(paymentData.legal_name, 11);
      }

      headerLine(paymentData.school_address, 10);

      const contact = [
        paymentData.school_phone ? `Phone: ${paymentData.school_phone}` : null,
        paymentData.school_email || null,
      ].filter(Boolean).join('   ·   ');
      headerLine(contact, 10);

      // Receipt title
      doc.fontSize(18).text('PAYMENT RECEIPT', 200, 150, { align: 'center' });
      
      // Receipt number and date
      doc.fontSize(12)
         .text(`Receipt No: ${paymentData.receipt_no}`, 50, 190)
         // en-GB: day/month/year. The server's default locale rendered
         // 8/13/2026 on a Ugandan receipt, which reads as a nonexistent date.
         .text(`Date: ${new Date(paymentData.created_at).toLocaleString('en-GB')}`, 350, 190);

      // Student details
      doc.fontSize(14).text('Student Information', 50, 230);
      doc.fontSize(11)
         .text(`Name: ${paymentData.student_name || 'N/A'}`, 50, 250)
         .text(`Admission No: ${paymentData.admission_no}`, 50, 265)
         .text(`Class: ${paymentData.class_name || 'N/A'}`, 50, 280)
         .text(`Term: ${paymentData.term_name || 'N/A'}`, 50, 295);

      // Payment details
      doc.fontSize(14).text('Payment Details', 50, 330);
      
      const startY = 350;
      doc.fontSize(11);
      
      // The amount is the whole point of a receipt, so it is printed
      // unconditionally. This used to sit inside `if (receipt_metadata?.items)`
      // — a receipt whose metadata was null, or arrived as an unparsed string,
      // showed a learner, a date and NO money at all.
      let meta: any = paymentData.receipt_metadata;
      if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
      const items: Array<{ item: string; amount: number }> =
        Array.isArray(meta?.items) ? meta.items : [];

      let itemY = startY;
      if (items.length) {
        doc.text('Item', 50, itemY).text('Amount', 400, itemY);
        for (const item of items) {
          itemY += 20;
          doc.text(String(item.item ?? ''), 50, itemY, { width: 330 })
             .text(money(paymentData.currency, item.amount), 400, itemY);
        }
        itemY += 30;
        doc.text(`Subtotal: ${money(paymentData.currency, paymentData.amount)}`, 300, itemY);
      }

      if (Number(paymentData.discount_applied) > 0) {
        itemY += 15;
        doc.text(`Discount: ${money(paymentData.currency, paymentData.discount_applied)}`, 300, itemY);
      }
      if (Number(paymentData.tax_amount) > 0) {
        itemY += 15;
        doc.text(`Tax: ${money(paymentData.currency, paymentData.tax_amount)}`, 300, itemY);
      }

      itemY += 15;
      doc.fontSize(13).text(`Total Paid: ${money(paymentData.currency, paymentData.amount)}`, 300, itemY);

      // Payment method
      doc.fontSize(11).text(`Payment Method: ${(paymentData.method || 'N/A').toUpperCase()}`, 50, 480);
      doc.text(`Paid By: ${paymentData.paid_by || 'N/A'}`, 50, 495);
      if (paymentData.payer_contact) {
        doc.text(`Contact: ${paymentData.payer_contact}`, 50, 510);
      }

      // Generate QR code for verification
      const qrData = JSON.stringify({
        receipt_no: paymentData.receipt_no,
        payment_id: paymentData.id,
        amount: paymentData.amount,
        timestamp: paymentData.created_at
      });

      const qrCodeDataURL = await QRCode.toDataURL(qrData, { width: 100 });
      const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
      
      doc.image(qrBuffer, 450, 450, { width: 80 });
      doc.fontSize(8).text('Scan to verify', 460, 540);

      // Footer
      doc.fontSize(10).text('Thank you for your payment!', 50, 600);
      doc.fontSize(8).text('This is a computer-generated receipt.', 50, 620);
      
      // Signature line
      doc.moveTo(50, 680).lineTo(200, 680).stroke();
      doc.text('Cashier Signature', 50, 690);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}
