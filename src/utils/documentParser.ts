import JSZip from 'jszip';

export interface ParsedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string; // Extracted text content or Base64 representation for PDF
}

export async function parseDocument(file: File): Promise<ParsedDocument> {
  const fileType = file.type || '';
  const fileName = file.name;
  const fileSize = file.size;
  const fileExtension = fileName.split('.').pop()?.toLowerCase();

  return new Promise((resolve, reject) => {
    // 1. PDF Reader - Load Base64
    if (fileType === 'application/pdf' || fileExtension === 'pdf') {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip out the data URI prefix "data:application/pdf;base64,"
        const base64Content = result.split(',')[1] || '';
        resolve({
          id: crypto.randomUUID(),
          name: fileName,
          size: fileSize,
          type: 'application/pdf',
          content: base64Content
        });
      };
      reader.onerror = (err) => reject(new Error('Failed to read PDF file: ' + err));
      reader.readAsDataURL(file);
      return;
    }

    // 2. Word documents (.docx) Reader using JSZip
    if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileExtension === 'docx'
    ) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          // Load DOCX as a zip archive
          const zip = await JSZip.loadAsync(arrayBuffer);
          const documentXml = zip.file('word/document.xml');
          
          if (!documentXml) {
            throw new Error('Malformed Word Document: Missing word/document.xml entry point.');
          }

          const xmlContent = await documentXml.async('text');
          const parser = new DOMParser();
          const doc = parser.parseFromString(xmlContent, 'application/xml');
          
          // Elements in docx paragraphs are wrapped in <w:t> nodes
          const textNodes = doc.getElementsByTagName('w:t');
          let text = '';
          for (let i = 0; i < textNodes.length; i++) {
            text += textNodes[i].textContent + ' ';
          }

          resolve({
            id: crypto.randomUUID(),
            name: fileName,
            size: fileSize,
            type: 'text/plain',
            content: text.trim()
          });
        } catch (docxErr: any) {
          reject(new Error('Failed to extract text from Word document: ' + docxErr.message));
        }
      };
      reader.onerror = (err) => reject(new Error('Failed to read DOCX file: ' + err));
      reader.readAsArrayBuffer(file);
      return;
    }

    // 3. Pure Text-Based Documents & Code Scripts (Txt, Md, CSV, JSON, code...)
    const textExtensions = ['txt', 'md', 'json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'html', 'css', 'ini', 'conf', 'go', 'rs', 'sh', 'sql'];
    const isTextLike = fileType.startsWith('text/') || textExtensions.includes(fileExtension || '');
    
    if (isTextLike) {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: crypto.randomUUID(),
          name: fileName,
          size: fileSize,
          type: 'text/plain',
          content: (reader.result as string) || ''
        });
      };
      reader.onerror = (err) => reject(new Error('Failed to read text file: ' + err));
      reader.readAsText(file);
      return;
    }

    // Standard Fallback: Try reading as text
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: fileName,
        size: fileSize,
        type: 'text/plain',
        content: (reader.result as string) || ''
      });
    };
    reader.onerror = (err) => reject(new Error('Unexpected file structure: ' + err));
    reader.readAsText(file);
  });
}
