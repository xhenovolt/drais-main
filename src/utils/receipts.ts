import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: {
      head?: string[][];
      body?: (string | number)[][];
      startY?: number;
      styles?: Record<string, unknown>;
      headStyles?: Record<string, unknown>;
      footStyles?: Record<string, unknown>;
      theme?: string;
      columnStyles?: Record<number, Record<string, unknown>>;
    }) => void;
  }
}

export interface ReceiptData {
  schoolInfo: {
    name: string;
    address: string;
    contact: string;
    email?: string;
    logo?: string;
    tin?: string;
  };
  payment: {
    receiptNo: string;
    invoiceNo?: string;
    date: string;
    time?: string;
    amount: number;
    amountWords: string;
    method: string;
    paidBy: string;
    payerContact?: string;
    reference?: string;
    currency: string;
  };
  student: {
    id: string;
    name: string;
    admissionNo: string;
    class: string;
    section?: string;
    term: string;
    academicYear: string;
  };
  items: Array<{
    name: string;
    description?: string;
    amount: number;
  }>;
  balance?: {
    previous: number;
    current: number;
  };
  footer?: {
    cashier?: string;
    signature?: string;
  };
}

/**
 * Convert number to words (English)
 */
export function numberToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const num = Math.floor(amount);
  const decimals = Math.round((amount - num) * 100);
  
  let words = '';
  
  if (num === 0) {
    words = 'Zero';
  } else if (num < 20) {
    words = ones[num];
  } else if (num < 100) {
    words = tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  } else if (num < 1000) {
    words = ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  } else if (num < 1000000) {
    words = numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  } else {
    words = numberToWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '');
  }
  
  if (decimals > 0) {
    words += ' Shillings and ' + numberToWords(decimals) + ' Cents';
  } else {
    words += ' Shillings';
  }
  
  return words;
}

/**
 * Generate QR code as data URL
 */
export async function generateQRCode(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: 80,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('QR Code generation error:', error);
    return '';
  }
}

/**
 * Generate professional A4 receipt with QR code
 */
export async function generateProfessionalReceipt(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF();
  const { schoolInfo, payment, student, items, footer } = data;
  
  // Generate QR code data
  const qrData = JSON.stringify({
    receipt_no: payment.receiptNo,
    payment_date: payment.date,
    amount: payment.amount,
    currency: payment.currency,
    student_id: student.id,
    student_name: student.name,
    verified: true,
    timestamp: new Date().toISOString()
  });
  
  const qrCodeDataUrl = await generateQRCode(qrData);
  
  // Header with school info
  if (schoolInfo.logo) {
    try {
      doc.addImage(schoolInfo.logo, 'PNG', 20, 10, 25, 25);
    } catch (e) {
      // Logo not found, skip
    }
  }
  
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(schoolInfo.name, 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(schoolInfo.address || '', 105, 28, { align: 'center' });
  doc.text(schoolInfo.contact || '', 105, 34, { align: 'center' });
  if (schoolInfo.email) {
    doc.text(schoolInfo.email, 105, 40, { align: 'center' });
  }
  if (schoolInfo.tin) {
    doc.text(`TIN: ${schoolInfo.tin}`, 105, 46, { align: 'center' });
  }
  
  // Divider line
  doc.setLineWidth(0.5);
  doc.line(20, 52, 190, 52);
  
  // Receipt title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('OFFICIAL RECEIPT', 105, 62, { align: 'center' });
  
  // Receipt details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const receiptLeft = 25;
  const receiptRight = 130;
  let yPos = 75;
  
  doc.text(`Receipt No: ${payment.receiptNo}`, receiptLeft, yPos);
  doc.text(`Date: ${payment.date}`, receiptRight, yPos, { align: 'left' });
  
  yPos += 8;
  doc.text(`Time: ${payment.time || new Date().toLocaleTimeString()}`, receiptLeft, yPos);
  doc.text(`Academic Year: ${student.academicYear}`, receiptRight, yPos, { align: 'left' });
  
  yPos += 8;
  doc.text(`Term: ${student.term}`, receiptLeft, yPos);
  if (payment.reference) {
    doc.text(`Reference: ${payment.reference}`, receiptRight, yPos, { align: 'left' });
  }
  
  // Student info box
  yPos += 12;
  doc.setFillColor(245, 245, 245);
  doc.rect(receiptLeft - 5, yPos - 5, 180, 30, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT INFORMATION', receiptLeft, yPos + 3);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${student.name}`, receiptLeft, yPos + 12);
  doc.text(`Admission No: ${student.admissionNo}`, 120, yPos + 12);
  
  doc.text(`Class: ${student.class}`, receiptLeft, yPos + 21);
  if (student.section) {
    doc.text(`Section: ${student.section}`, 120, yPos + 21);
  }
  
  // Items table
  yPos += 45;
  
  const tableBody = items.map(item => [
    item.name,
    item.description || '',
    `${payment.currency} ${item.amount.toLocaleString()}`
  ]);
  
  // Add totals row
  tableBody.push(['', 'TOTAL PAID', `${payment.currency} ${payment.amount.toLocaleString()}`]);
  
  doc.autoTable({
    startY: yPos,
    head: [['Description', 'Details', 'Amount']],
    body: tableBody,
    styles: {
      fontSize: 10,
      cellPadding: 3,
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 50 },
      2: { cellWidth: 40, halign: 'right' }
    },
    theme: 'plain'
  });
  
  // Amount in words
  yPos = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text(`Amount in Words: ${payment.amountWords}`, receiptLeft, yPos);
  
  // Payment method
  yPos += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Payment Method: ${payment.method.toUpperCase()}`, receiptLeft, yPos);
  doc.text(`Paid By: ${payment.paidBy}`, 120, yPos);
  if (payment.payerContact) {
    doc.text(`Contact: ${payment.payerContact}`, receiptLeft, yPos + 7);
  }
  
  // QR Code
  if (qrCodeDataUrl) {
    doc.addImage(qrCodeDataUrl, 'PNG', 150, yPos, 35, 35);
    doc.setFontSize(7);
    doc.text('Scan to Verify', 167, yPos + 38, { align: 'center' });
  }
  
  // Footer
  yPos = 250;
  doc.setFontSize(9);
  doc.line(20, yPos, 190, yPos);
  
  yPos += 8;
  doc.text('Thank you for your payment!', 105, yPos, { align: 'center' });
  yPos += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a computer-generated receipt and does not require a signature.', 105, yPos, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString()}`, 105, yPos + 5, { align: 'center' });
  
  if (footer?.cashier) {
    doc.text(`Cashier: ${footer.cashier}`, 30, yPos + 15);
  }
  if (footer?.signature) {
    doc.text(`Authorized Signature: _________________`, 120, yPos + 15);
  }
  
  return doc;
}

/**
 * Generate professional A4 invoice
 */
export async function generateProfessionalInvoice(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF();
  const { schoolInfo, payment, student, items, balance } = data;
  
  // Generate QR code for invoice verification
  const qrData = JSON.stringify({
    invoice_no: payment.invoiceNo || payment.receiptNo,
    student_id: student.id,
    student_name: student.name,
    academic_year: student.academicYear,
    term: student.term,
    amount: payment.amount,
    currency: payment.currency,
    date: payment.date,
    verified: true,
    timestamp: new Date().toISOString()
  });
  
  const qrCodeDataUrl = await generateQRCode(qrData);
  
  // Header
  if (schoolInfo.logo) {
    try {
      doc.addImage(schoolInfo.logo, 'PNG', 15, 10, 25, 25);
    } catch (e) {
      // Logo not found
    }
  }
  
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(schoolInfo.name, 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(schoolInfo.address || '', 105, 28, { align: 'center' });
  doc.text(`${schoolInfo.contact || ''} | ${schoolInfo.email || ''}`, 105, 34, { align: 'center' });
  if (schoolInfo.tin) {
    doc.text(`TIN: ${schoolInfo.tin}`, 105, 40, { align: 'center' });
  }
  
  doc.setLineWidth(0.5);
  doc.line(15, 45, 195, 45);
  
  // Invoice title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 105, 58, { align: 'center' });
  
  // Invoice details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  let xPos = 20;
  let yPos = 70;
  
  doc.text(`Invoice No: ${payment.invoiceNo || payment.receiptNo}`, xPos, yPos);
  doc.text(`Date: ${payment.date}`, 150, yPos);
  
  yPos += 7;
  doc.text(`Academic Year: ${student.academicYear}`, xPos, yPos);
  doc.text(`Term: ${student.term}`, 150, yPos);
  
  yPos += 7;
  doc.text(`Due Date: ${balance?.current ? 'Upon Receipt' : 'N/A'}`, xPos, yPos);
  
  // Bill To
  yPos += 15;
  doc.setFillColor(245, 245, 245);
  doc.rect(xPos - 5, yPos - 5, 100, 35, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', xPos, yPos + 3);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`${student.name}`, xPos, yPos + 12);
  doc.text(`Admission No: ${student.admissionNo}`, xPos, yPos + 20);
  doc.text(`Class: ${student.class}${student.section ? ` - ${student.section}` : ''}`, xPos, yPos + 28);
  
  // Items table
  yPos += 50;
  
  const tableBody = items.map(item => [
    item.name,
    item.description || '',
    `${payment.currency} ${item.amount.toLocaleString()}`
  ]);
  
  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  
  tableBody.push(
    ['', 'Subtotal:', `${payment.currency} ${subtotal.toLocaleString()}`],
    ['', 'TOTAL DUE:', `${payment.currency} ${payment.amount.toLocaleString()}`
  ]);
  
  doc.autoTable({
    startY: yPos,
    head: [['Description', 'Details', 'Amount']],
    body: tableBody,
    styles: {
      fontSize: 10,
      cellPadding: 4,
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 50 },
      2: { cellWidth: 40, halign: 'right' }
    },
    footStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: 'bold'
    },
    theme: 'plain'
  });
  
  // Amount in words
  yPos = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text(`Amount Due in Words: ${payment.amountWords}`, xPos, yPos);
  
  // Payment instructions
  yPos += 15;
  doc.setFillColor(255, 248, 225);
  doc.rect(xPos - 5, yPos - 5, 180, 25, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PAYMENT INSTRUCTIONS', xPos, yPos + 3);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Please make payments to:', xPos, yPos + 12);
  doc.text('Bank: [Bank Name] | Account: [Account Number] | Branch: [Branch]', xPos + 45, yPos + 12);
  doc.text('Or pay via M-Pesa to: [Phone Number]', xPos, yPos + 20);
  
  // QR Code
  if (qrCodeDataUrl) {
    doc.addImage(qrCodeDataUrl, 'PNG', 155, yPos, 30, 30);
    doc.setFontSize(7);
    doc.text('Scan to Pay', 170, yPos + 33, { align: 'center' });
  }
  
  // Footer
  yPos = 260;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('This invoice is valid upon payment. Please include invoice number on your payment.', 105, yPos, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString()}`, 105, yPos + 6, { align: 'center' });
  
  // Authorization
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Authorized Signature: _________________', 30, yPos + 20);
  doc.text('School Stamp', 140, yPos + 20);
  
  return doc;
}

/**
 * Generate narrow thermal receipt for POS printers
 */
export function generateThermalReceipt(data: ReceiptData): string {
  const { schoolInfo, payment, student, items } = data;
  
  const lineWidth = 40;
  const center = (text: string) => text.padStart((lineWidth + text.length) / 2).padEnd(lineWidth);
  
  let receipt = '';
  
  receipt += center(schoolInfo.name) + '\n';
  receipt += center(schoolInfo.address || '') + '\n';
  receipt += center(schoolInfo.contact || '') + '\n';
  receipt += '-'.repeat(lineWidth) + '\n';
  
  receipt += center('OFFICIAL RECEIPT') + '\n';
  receipt += '-'.repeat(lineWidth) + '\n';
  
  receipt += `Rcpt No: ${payment.receiptNo}\n`;
  receipt += `Date: ${payment.date} ${payment.time || ''}\n`;
  receipt += `Ref: ${payment.reference || 'N/A'}\n`;
  receipt += '-'.repeat(lineWidth) + '\n';
  
  receipt += `${student.name}\n`;
  receipt += `Adm: ${student.admissionNo} | ${student.class}\n`;
  receipt += `${student.term} | ${student.academicYear}\n`;
  receipt += '-'.repeat(lineWidth) + '\n';
  
  items.forEach(item => {
    receipt += `${item.name}\n`;
    receipt += `${' '.repeat(lineWidth - 15)}${payment.currency} ${item.amount.toLocaleString()}\n`;
  });
  
  receipt += '-'.repeat(lineWidth) + '\n';
  receipt += `${'TOTAL'.padEnd(lineWidth - 15)}${payment.currency} ${payment.amount.toLocaleString()}\n`;
  receipt += `Amount: ${payment.amountWords}\n`;
  receipt += '-'.repeat(lineWidth) + '\n';
  
  receipt += `Method: ${payment.method.toUpperCase()}\n`;
  receipt += `Paid By: ${payment.paidBy}\n`;
  if (payment.payerContact) {
    receipt += `Contact: ${payment.payerContact}\n`;
  }
  
  receipt += '-'.repeat(lineWidth) + '\n';
  receipt += center('Thank You!') + '\n';
  receipt += center('Verified Receipt') + '\n';
  receipt += center(new Date().toLocaleString()) + '\n';
  
  return receipt;
}


