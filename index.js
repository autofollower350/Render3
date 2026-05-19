const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// --- Front-end (Sunder HTML Form) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>JNVU Admit Card Portal</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; background: #eef2f3; text-align: center; padding: 50px 20px; margin: 0; }
                .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 450px; margin: 0 auto; }
                h2 { color: #ff4b4b; margin-top: 0; }
                input { width: 90%; padding: 12px; margin: 15px 0; border: 1px solid #ccc; border-radius: 6px; font-size: 16px; text-align: center; }
                button { width: 95%; padding: 12px; background: #ff4b4b; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; transition: 0.2s; }
                button:hover { background: #e04343; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🚩 RajasthaniBoyz Portal</h2>
                <p style="color:#666;">Apna JNVU Form Number dalo aur Admit Card download karo</p>
                <form action="/download" method="POST">
                    <input type="text" name="form_no" placeholder="Enter Form / Challan Number" required><br>
                    <button type="submit">🚀 Get Admit Card & Data</button>
                </form>
                <div class="footer">Powered by Playwright & Express</div>
            </div>
        </body>
        </html>
    `);
});

// --- PDF Extract Logic (Aapka Regex Code) ---
async function extractStudentInfo(pdfPath) {
    const info = { name: "Not Found", father: "Not Found", roll: "Not Found", center: "Not Found" };
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdfParse(dataBuffer);
        const text = data.text;

        const rollMatch = text.match(/Roll no is\s+([\w\d]+)/);
        if (rollMatch) info.roll = rollMatch[1].trim();

        const nameMatch = text.match(/NAME OF CANDIDATE\s*:\s*(.*)/);
        if (nameMatch) info.name = nameMatch[1].split('\n')[0].trim();

        const fatherMatch = text.match(/FATHER'S NAME\s*:\s*(.*)/);
        if (fatherMatch) info.father = fatherMatch[1].split('\n')[0].trim();

        const centerPattern = /Exam Centre is\s*([\s\S]*?)(?=Print Date|To,|The Centre|NAME OF EXAMINATION)/;
        const centerMatch = text.match(centerPattern);
        if (centerMatch) {
            info.center = centerMatch[1].replace(/\s+/g, ' ').trim();
        } else {
            const altMatch = text.match(/CENTER OF EXAMINATION\s*:\s*([\s\S]*?)(?=\nSR NO|\nPrint Date)/);
            if (altMatch) info.center = altMatch[1].replace(/\s+/g, ' ').trim();
        }
        return info;
    } catch (error) {
        console.error(`Extraction Error: ${error.message}`);
        return info;
    }
}

// --- Download and Response Route ---
app.post('/download', async (req, res) => {
    const formNo = req.body.form_no;
    if (!formNo || !/^\d+$/.test(formNo)) {
        return res.send("<h3>❌ Error: Invalid Form Number!</h3><a href='/'>Wapas Jao</a>");
    }

    const pdfPath = path.join(__dirname, `admit_card_${formNo}.pdf`);
    let browser;

    try {
        browser = await chromium.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();

        // Fast load ke liye faltu cheezein block karna
        await page.route('**/*.{png,jpg,jpeg,gif,css,woff2}', route => route.abort());

        const url = "https://erp.jnvuiums.in/(S(biolzjtwlrcfmzwwzgs5uj5n))/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx#";
        await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
        
        await page.fill("#txtchallanNo", String(formNo));
        
        const submitBtn = page.locator("#btnGetResult");
        const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
        
        await submitBtn.click();
        await page.waitForTimeout(500); 
        await submitBtn.click(); // Double click handle karne ke liye

        const download = await downloadPromise;
        await download.saveAs(pdfPath);
        await browser.close();

        if (fs.existsSync(pdfPath)) {
            // PDF se data extract karein console aur future features ke liye
            const studentData = await extractStudentInfo(pdfPath);
            console.log(`\n✅ Downloaded for: ${studentData.name} | Roll: ${studentData.roll}\n`);

            // Direct user ke browser mein download bhejna
            res.download(pdfPath, `JNVU_${formNo}.pdf`, () => {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); // File ko delete karna taaki server space full na ho
            });
        } else {
            res.send("<h3>❌ Error: Admit Card file nahi mili.</h3><a href='/'>Wapas Try Karein</a>");
        }

    } catch (error) {
        if (browser) await browser.close();
        res.send(`<h3>❌ Error: Admit Card nahi mila ya JNVU site down hai.</h3><p>${error.message}</p><a href='/'>Wapas Try Karein</a>`);
    }
});

app.listen(port, () => {
    console.log(`Web Server running on port ${port}`);
});
