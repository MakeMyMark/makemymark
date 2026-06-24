// ============================================================
// MAKE MY MARK — Google Apps Script Backend v2
// Paste this entire script into Google Apps Script
// (script.google.com → your existing project → replace all)
// ============================================================

// ── CONFIGURATION ────────────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_GOOGLE_SHEET_ID_HERE',
  ATTORNEY_EMAIL: 'attorney@makemymark.legal',
  ATTORNEY_NAME: 'Graves Law Firm, PLLC',
  ATTORNEY_BAR: 'Oklahoma Bar Association',
  ATTORNEY_PHONE: '+14052265582',
  TWILIO_ACCOUNT_SID: 'AC1b820465d2bc147c64861c34420cf3a1',
  TWILIO_AUTH_TOKEN: '6e03b5ed86adb47f92d757317757bf0a',
  TWILIO_FROM_NUMBER: '+18445521585',
  STAGE2_URL: 'https://makemymark.github.io/makemymark/stage2.html',
  DRIVE_FOLDER_NAME: 'Make My Mark — Client Files',
};
// ────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.stage === '1') {
      handleStage1(data);
    } else if (data.stage === 'engagement') {
      handleEngagementSigned(data);
    } else if (data.stage === '2') {
      handleStage2(data);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log('Error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── STAGE 1 — Initial Intake ─────────────────────────────────
function handleStage1(data) {

  // 1. Create a dedicated Google Drive folder for this client
  const clientFolderName = `${data.lastName}, ${data.firstName} — ${data.markName}`;
  const driveFolder = getOrCreateClientFolder(clientFolderName);
  const driveFolderUrl = driveFolder.getUrl();

  // 2. Save to Google Sheet
  saveToSheet('Stage 1 — Intake', [
    data.timestamp,
    data.firstName,
    data.lastName,
    data.email,
    data.phone,
    data.address,
    data.city,
    data.state,
    data.zip,
    data.country,
    data.entityType,
    data.citizenship,
    data.markName,
    data.markType,
    data.filingBasis,
    data.goodsServices,
    data.plan,
    data.notes,
    driveFolderUrl,
    'Stage 1 Complete — Engagement Letter Sent'
  ]);

  // 3. Generate and send Engagement Letter PDF
  const engagementPdf = generateEngagementLetter(data, driveFolderUrl);

  // 4. Save engagement letter to client's Drive folder
  driveFolder.createFile(engagementPdf.copyBlob().setName(`Engagement Letter — ${data.firstName} ${data.lastName}.pdf`));

  // 5. Create engagement signing page URL with client data encoded
  const engagementParams = encodeURIComponent(JSON.stringify({
    email: data.email,
    name: `${data.firstName} ${data.lastName}`,
    plan: data.plan,
    mark: data.markName,
    folder: driveFolderUrl
  }));
  const engagementUrl = `https://makemymark.github.io/makemymark/engagement.html?data=${engagementParams}`;

  // 6. Send email to client with engagement letter attached
  const clientEmailBody = `
Dear ${data.firstName},

Thank you for choosing Make My Mark. We are pleased to represent you in connection with your federal trademark application.

YOUR SELECTED PLAN: ${data.plan}
MARK: ${data.markName}

NEXT STEP — ENGAGEMENT LETTER

Before we proceed, please review and sign the attached Engagement Letter, which formally establishes our attorney-client relationship and confirms the terms of our representation.

→ SIGN YOUR ENGAGEMENT LETTER ONLINE:
${engagementUrl}

Once you sign the Engagement Letter, you will automatically receive a link to complete your detailed trademark information (Step 2).

IMPORTANT: Please also set up your client file folder using the link below. You will need to upload your logo file and/or specimen of use (a photo showing your mark in use) to this folder. We cannot file your application without these materials if applicable.

→ YOUR SECURE CLIENT FILE FOLDER:
${driveFolderUrl}

Please upload the following to your folder (if applicable):
• Your logo or design mark (JPG, PNG, or SVG — high resolution preferred)
• A specimen showing your mark in use (photo of product with mark, website screenshot showing mark with buy button, menu, label, etc.)
• Name your files clearly: "LOGO — [Your Mark Name]" and "SPECIMEN — [Your Mark Name]"

If you have any questions, reply to this email or contact us at ${CONFIG.ATTORNEY_EMAIL}.

Thank you,

${CONFIG.ATTORNEY_NAME}
Make My Mark
${CONFIG.ATTORNEY_EMAIL}

---
Attorney advertising. This communication is confidential and intended solely for the named recipient.
  `.trim();

  GmailApp.sendEmail(
    data.email,
    'Make My Mark — Please Sign Your Engagement Letter',
    clientEmailBody,
    {
      from: CONFIG.ATTORNEY_EMAIL,
      name: 'Make My Mark | Graves Law Firm, PLLC',
      attachments: [engagementPdf]
    }
  );

  // 7. Text attorney
  const msg = `🔔 NEW CLIENT — MAKE MY MARK\n\n` +
    `Name: ${data.firstName} ${data.lastName}\n` +
    `Email: ${data.email}\n` +
    `Plan: ${data.plan}\n` +
    `Mark: ${data.markName}\n\n` +
    `Engagement letter sent. Awaiting client signature.\n` +
    `Client folder: ${driveFolderUrl}`;
  sendTwilioSMS(msg);
}

// ── ENGAGEMENT SIGNED ────────────────────────────────────────
function handleEngagementSigned(data) {

  // 1. Save signed engagement to Sheet
  saveToSheet('Engagement Letters', [
    data.timestamp,
    data.clientEmail,
    data.clientName,
    data.plan,
    data.markName,
    data.signatureName,
    data.signatureDate,
    data.ipAddress || 'Not captured',
    'Signed'
  ]);

  // 2. Update Stage 1 sheet status
  updateSheetStatus('Stage 1 — Intake', data.clientEmail, 'Engagement Signed — Stage 2 Link Sent');

  // 3. Send Stage 2 link to client
  const stage2EmailBody = `
Dear ${data.clientName.split(' ')[0]},

Thank you for signing your Engagement Letter. Our attorney-client relationship is now formally established.

NEXT STEP — COMPLETE YOUR TRADEMARK DETAILS

Please complete the detailed trademark information form using the link below. This typically takes 10–15 minutes and gives us everything we need to prepare your USPTO application.

→ COMPLETE YOUR TRADEMARK DETAILS (Step 2):
${CONFIG.STAGE2_URL}

When prompted, enter your email address (${data.clientEmail}) to link your information to this application.

REMINDER — UPLOAD YOUR FILES

If you haven't already, please upload your logo and/or specimen files to your secure client folder. We cannot file without these if your application requires them.

A licensed attorney will review everything before anything is submitted to the USPTO.

Thank you,

${CONFIG.ATTORNEY_NAME}
Make My Mark
${CONFIG.ATTORNEY_EMAIL}
  `.trim();

  GmailApp.sendEmail(
    data.clientEmail,
    'Make My Mark — Complete Your Trademark Details (Step 2)',
    stage2EmailBody,
    {
      from: CONFIG.ATTORNEY_EMAIL,
      name: 'Make My Mark | Graves Law Firm, PLLC'
    }
  );

  // 4. Text attorney
  sendTwilioSMS(`✍️ ENGAGEMENT SIGNED\n\n${data.clientName}\n${data.clientEmail}\nPlan: ${data.plan}\nMark: ${data.markName}\n\nStage 2 link sent.`);
}

// ── STAGE 2 — Mark Details ───────────────────────────────────
function handleStage2(data) {

  // 1. Save to Sheet
  saveToSheet('Stage 2 — Mark Details', [
    data.timestamp,
    data.clientEmail,
    data.markText,
    data.stdChars,
    data.logoFileName,
    data.colorDesc,
    data.translation,
    data.livingPerson,
    data.detailedGoods,
    data.intlClass,
    data.inUse,
    data.firstUseDate,
    data.firstUseCommerce,
    data.specimenFileName,
    data.specimenUrl,
    data.existingReg,
    data.existingRegNums,
    data.signatureName,
    data.signerTitle,
    data.signatureDate,
    data.declarationSigned,
    data.attorneyNotes,
    'Stage 2 Complete — Ready for Attorney Review'
  ]);

  // 2. Text attorney
  const msg = `✅ READY TO FILE — MAKE MY MARK\n\n` +
    `Client: ${data.clientEmail}\n` +
    `Mark: ${data.markText}\n` +
    `Use in Commerce: ${data.inUse}\n` +
    `Logo file: ${data.logoFileName || 'N/A'}\n` +
    `Specimen file: ${data.specimenFileName || 'N/A'}\n\n` +
    `All stages complete. Check Google Sheet and client Drive folder.`;
  sendTwilioSMS(msg);

  // 3. Confirm to client
  GmailApp.sendEmail(
    data.clientEmail,
    'Make My Mark — Trademark Details Received',
    `Dear Client,\n\nWe have received your complete trademark details. A licensed attorney will review everything and be in touch within 24 hours.\n\nThank you for choosing Make My Mark.\n\n${CONFIG.ATTORNEY_NAME}\nMake My Mark\n${CONFIG.ATTORNEY_EMAIL}`,
    { from: CONFIG.ATTORNEY_EMAIL, name: 'Make My Mark | Graves Law Firm, PLLC' }
  );
}

// ── GENERATE ENGAGEMENT LETTER PDF ──────────────────────────
function generateEngagementLetter(data, driveFolderUrl) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const planFees = {
    'Standard — $749': { total: '$749', refund: '$499 ($749 minus $250 earned attorney fee)' },
    'Plus — $999': { total: '$999', refund: '$749 ($999 minus $250 earned attorney fee)' },
    'Business — $1,249': { total: '$1,249', refund: '$999 ($1,249 minus $250 earned attorney fee)' },
    'Premium — $1,499': { total: '$1,499', refund: 'Full attorney fee refund if mark ultimately denied' },
  };

  const planKey = Object.keys(planFees).find(k => data.plan.includes(k.split(' — ')[0])) || 'Standard — $749';
  const fees = planFees[planKey] || planFees['Standard — $749'];

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 40px; }
  .header { text-align: center; border-bottom: 2px solid #0F1C3F; padding-bottom: 20px; margin-bottom: 30px; }
  .firm-name { font-size: 18pt; font-weight: bold; color: #0F1C3F; letter-spacing: 0.05em; }
  .firm-sub { font-size: 9pt; color: #6B7280; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 4px; }
  .doc-title { font-size: 14pt; font-weight: bold; text-align: center; margin: 24px 0 8px; color: #0F1C3F; }
  .doc-date { text-align: center; font-size: 9pt; color: #6B7280; margin-bottom: 30px; }
  h3 { font-size: 11pt; color: #0F1C3F; margin-top: 24px; margin-bottom: 6px; border-bottom: 1px solid #E5E9F2; padding-bottom: 4px; }
  p { margin: 0 0 12px; }
  .sig-block { margin-top: 48px; display: flex; gap: 60px; }
  .sig-col { flex: 1; }
  .sig-line { border-top: 1px solid #1a1a1a; margin-top: 48px; padding-top: 6px; font-size: 9pt; color: #6B7280; }
  .highlight { background: #FDF6E3; border-left: 3px solid #C9973A; padding: 10px 14px; margin: 16px 0; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  th { background: #0F1C3F; color: #fff; padding: 8px 12px; text-align: left; font-size: 9pt; }
  td { padding: 8px 12px; border-bottom: 1px solid #E5E9F2; vertical-align: top; }
  tr:nth-child(even) td { background: #F8F9FC; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #E5E9F2; font-size: 8pt; color: #9CA3AF; text-align: center; line-height: 1.5; }
</style>
</head>
<body>

<div class="header">
  <div class="firm-name">Make My Mark</div>
  <div class="firm-sub">Graves Law Firm, PLLC &nbsp;·&nbsp; Oklahoma Bar Association &nbsp;·&nbsp; attorney@makemymark.legal</div>
</div>

<div class="doc-title">ENGAGEMENT LETTER &amp; FEE AGREEMENT</div>
<div class="doc-date">${dateStr}</div>

<p>Dear ${data.firstName} ${data.lastName},</p>

<p>Thank you for selecting Make My Mark for your trademark filing needs. This Engagement Letter confirms the terms of our representation and serves as our fee agreement. Please read it carefully and sign below to formally establish our attorney-client relationship.</p>

<h3>1. Scope of Representation</h3>
<p>Graves Law Firm, PLLC, agrees to represent you in connection with the preparation and filing of a federal trademark application with the United States Patent and Trademark Office (USPTO) for the following mark:</p>

<table>
  <tr><th>Mark</th><th>Filing Basis</th><th>Plan Selected</th></tr>
  <tr><td><strong>${data.markName}</strong></td><td>${data.filingBasis}</td><td>${data.plan}</td></tr>
</table>

<p>Services included under your selected plan are as described on the Make My Mark website and in the Terms &amp; Conditions, which are incorporated herein by reference. Our representation is limited to the specific matter described above and does not extend to any other legal matter, litigation, opposition proceedings, cancellation proceedings, or international trademark filings unless separately agreed in writing.</p>

<h3>2. Attorney Fees</h3>
<p>You agree to pay the following flat fee for services:</p>

<table>
  <tr><th>Service</th><th>Fee</th></tr>
  <tr><td>Attorney Service Fee (${data.plan.split(' — ')[0]} Plan)</td><td>${fees.total}</td></tr>
  <tr><td>USPTO Government Filing Fee (per class)</td><td>$350 (paid separately to USPTO)</td></tr>
  <tr><td>Non-Refundable Review Fee (included in above)</td><td>$100</td></tr>
  <tr><td>Attorney Fee Earned Upon Filing (included in above)</td><td>$250</td></tr>
</table>

<p>Payment of the attorney service fee is due prior to filing your application. USPTO fees will be communicated separately and are payable prior to filing.</p>

<h3>3. Refund Policy</h3>
<div class="highlight">
  <strong>If you cancel before filing:</strong> You will receive a full refund of the attorney service fee minus the $100 non-refundable review fee.<br><br>
  <strong>If your mark is ultimately denied after filing:</strong> ${fees.refund}. USPTO fees are non-refundable by federal law under any circumstances.
</div>

<h3>4. No Guarantee of Registration</h3>
<p>Make My Mark and Graves Law Firm, PLLC, do not guarantee that your trademark application will be approved or that your mark will be registered with the USPTO. Trademark registration is subject to the discretion of USPTO examining attorneys. Filing always carries inherent risk of denial. We will conduct a preliminary clearance search and advise you of any identified risks prior to filing, but no clearance search is exhaustive.</p>

<h3>5. Client Responsibilities</h3>
<p>You agree to provide accurate and complete information, respond promptly to our requests, and provide timely responses to any time-sensitive USPTO communications. Missed USPTO deadlines can result in permanent abandonment of your application with no refund of fees paid.</p>

<h3>6. Confidentiality</h3>
<p>All information you share with us is protected by attorney-client privilege and will be kept strictly confidential, except as required to provide services (including filing with the USPTO, which creates a public record) or as required by law.</p>

<h3>7. Governing Law</h3>
<p>This agreement is governed by the laws of the State of Oklahoma. Any dispute arising from this engagement shall be subject to the exclusive jurisdiction of the courts of Oklahoma County, Oklahoma.</p>

<h3>8. Acceptance</h3>
<p>By signing below (or by electronically signing via the Make My Mark website), you confirm that you have read, understood, and agreed to all terms of this Engagement Letter and Fee Agreement, and that you authorize Make My Mark to proceed with services on your behalf.</p>

<div class="sig-block">
  <div class="sig-col">
    <div class="sig-line">Client Signature</div>
    <div class="sig-line" style="margin-top:16px;">${data.firstName} ${data.lastName} — Date: ___________</div>
  </div>
  <div class="sig-col">
    <div class="sig-line">Attorney</div>
    <div class="sig-line" style="margin-top:16px;">Graves Law Firm, PLLC — Date: ${dateStr}</div>
  </div>
</div>

<div class="footer">
  Make My Mark &nbsp;·&nbsp; Graves Law Firm, PLLC &nbsp;·&nbsp; Oklahoma Bar Association<br>
  attorney@makemymark.legal &nbsp;·&nbsp; www.makemymark.legal<br>
  Attorney advertising. This document is confidential and intended solely for the named recipient.
</div>

</body>
</html>
  `;

  // Convert HTML to blob, then to PDF via Google Docs
  const blob = Utilities.newBlob(htmlContent, 'text/html', 'engagement.html');
  const tempFile = DriveApp.createFile(blob);
  const pdfBlob = tempFile.getAs('application/pdf').setName(`Engagement Letter — ${data.firstName} ${data.lastName}.pdf`);
  tempFile.setTrashed(true); // clean up temp file
  return pdfBlob;
}

// ── GOOGLE DRIVE HELPER ──────────────────────────────────────
function getOrCreateClientFolder(folderName) {
  // Find or create the main Make My Mark folder
  let mainFolder;
  const mainFolderIter = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (mainFolderIter.hasNext()) {
    mainFolder = mainFolderIter.next();
  } else {
    mainFolder = DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
  }

  // Create client subfolder
  const clientFolder = mainFolder.createFolder(folderName);

  // Share folder with attorney email (view access)
  clientFolder.addEditor(CONFIG.ATTORNEY_EMAIL);

  // Make folder accessible to anyone with the link for client uploads
  clientFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);

  return clientFolder;
}

// ── GOOGLE SHEETS HELPER ─────────────────────────────────────
function saveToSheet(sheetName, rowData) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    const headers = {
      'Stage 1 — Intake': ['Timestamp','First Name','Last Name','Email','Phone','Address','City','State','ZIP','Country','Entity Type','Citizenship','Mark Name','Mark Type','Filing Basis','Goods/Services','Plan','Notes','Drive Folder','Status'],
      'Engagement Letters': ['Timestamp','Client Email','Client Name','Plan','Mark Name','Signature Name','Signature Date','IP Address','Status'],
      'Stage 2 — Mark Details': ['Timestamp','Client Email','Mark Text','Std Characters','Logo File','Color Desc','Translation','Living Person','Detailed Goods','Intl Class','In Use','First Use Date','First Use Commerce','Specimen File','Specimen URL','Existing Reg','Reg Numbers','Signature Name','Signer Title','Signature Date','Declaration','Attorney Notes','Status']
    };

    if (headers[sheetName]) {
      sheet.appendRow(headers[sheetName]);
      sheet.getRange(1, 1, 1, headers[sheetName].length)
        .setBackground('#0F1C3F').setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }

  sheet.appendRow(rowData);
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

function updateSheetStatus(sheetName, email, newStatus) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const emailCol = data[0].indexOf('Email');
  const statusCol = data[0].indexOf('Status');

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailCol] === email) {
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      break;
    }
  }
}

// ── TWILIO SMS ────────────────────────────────────────────────
function sendTwilioSMS(message) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.TWILIO_ACCOUNT_SID}/Messages.json`;
  const options = {
    method: 'post',
    payload: { To: CONFIG.ATTORNEY_PHONE, From: CONFIG.TWILIO_FROM_NUMBER, Body: message },
    headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(CONFIG.TWILIO_ACCOUNT_SID + ':' + CONFIG.TWILIO_AUTH_TOKEN) },
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

// ── TEST ──────────────────────────────────────────────────────
function testSetup() {
  sendTwilioSMS('✅ Make My Mark v2 backend is live! Test from Google Apps Script.');
  Logger.log('Test SMS sent.');
}
