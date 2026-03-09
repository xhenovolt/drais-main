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

export async function generateReceiptPDF(paymentData: PaymentData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header with school info
      doc.fontSize(20).text(paymentData.school_name || 'School', 50, 50);
      if (paymentData.legal_name) {
        doc.fontSize(12).text(paymentData.legal_name, 50, 75);
      }
      
      if (paymentData.school_address) {
        doc.fontSize(10).text(paymentData.school_address, 50, 95);
      }
      
      if (paymentData.school_phone) {
        doc.text(`Phone: ${paymentData.school_phone}`, 50, 110);
      }

      // Receipt title
      doc.fontSize(18).text('PAYMENT RECEIPT', 200, 150, { align: 'center' });
      
      // Receipt number and date
      doc.fontSize(12)
         .text(`Receipt No: ${paymentData.receipt_no}`, 50, 190)
         .text(`Date: ${new Date(paymentData.created_at).toLocaleString()}`, 350, 190);

      // Student details
      doc.fontSize(14).text('Student Information', 50, 230);
      doc.fontSize(11)
         .text(`Name: ${paymentData.student_name}`, 50, 250)
         .text(`Admission No: ${paymentData.admission_no}`, 50, 265)
         .text(`Class: ${paymentData.class_name || 'N/A'}`, 50, 280)
         .text(`Term: ${paymentData.term_name}`, 50, 295);

      // Payment details
      doc.fontSize(14).text('Payment Details', 50, 330);
      
      const startY = 350;
      doc.fontSize(11);
      
      // Payment breakdown
      if (paymentData.receipt_metadata?.items) {
        let itemY = startY;
        doc.text('Item', 50, itemY).text('Amount', 400, itemY);
        
        const items = paymentData.receipt_metadata.items as Array<{ item: string; amount: number }>;
        items.forEach((item, index: number) => {
          itemY += 20;
          doc.text(item.item, 50, itemY)
             .text(`${paymentData.currency} ${item.amount.toLocaleString()}`, 400, itemY);
        });
        
        itemY += 30;
        doc.text(`Subtotal: ${paymentData.currency} ${paymentData.amount.toLocaleString()}`, 300, itemY);
        
        if (paymentData.discount_applied > 0) {
          itemY += 15;
          doc.text(`Discount: ${paymentData.currency} ${paymentData.discount_applied.toLocaleString()}`, 300, itemY);
        }
        
        if (paymentData.tax_amount > 0) {
          itemY += 15;
          doc.text(`Tax: ${paymentData.currency} ${paymentData.tax_amount.toLocaleString()}`, 300, itemY);
        }
        
        itemY += 15;
        doc.fontSize(12).text(`Total Paid: ${paymentData.currency} ${paymentData.amount.toLocaleString()}`, 300, itemY);
      }

      // Payment method
      doc.fontSize(11).text(`Payment Method: ${paymentData.method.toUpperCase()}`, 50, 480);
      doc.text(`Paid By: ${paymentData.paid_by}`, 50, 495);
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
