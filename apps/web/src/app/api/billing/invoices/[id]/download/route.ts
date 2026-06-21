import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;

  // 模拟发票 PDF 内容
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Title (Invoice ${invoiceId}) /Creator (HermesClaw Billing) >>
endobj
2 0 obj
<< /Type /Catalog /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages /Kids [4 0 R] /Count 1 >>
endobj
4 0 obj
<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
5 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
72 712 Td
(HermesClaw Invoice ${invoiceId} - Paid successfully) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000078 00000 n 
0000000127 00000 n 
0000000188 00000 n 
0000000282 00000 n 
trailer
<< /Size 6 /Root 2 0 R >>
startxref
381
%%EOF`;

  return new Response(pdfContent, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=invoice_${invoiceId}.pdf`,
    },
  });
}
