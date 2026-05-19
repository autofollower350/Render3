const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>JNVU Admit Card Portal</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; background: #eef2f3; text-align: center; padding: 50px 20px; margin: 0; }
                .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
                h2 { color: #333; margin-top: 0; }
                input { width: 90%; padding: 12px; margin: 15px 0; border: 1px solid #ccc; border-radius: 6px; font-size: 16px; text-align: center; }
                button { width: 95%; padding: 12px; background: #ff4b4b; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; }
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
                    <button type="submit">🚀 Get Admit Card</button>
                </form>
                <div class="footer">Powered by Playwright & Render</div>
            </div>
        </body>
        </html>
    `);
});

app.post('/download', async (req, res) => {
    const formNo = req.body.form_no;
    const pdfPath = path.join(__dirname, `AdmitCard_${formNo}.pdf`);

    try {
        const browser = await chromium.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        await page.goto('https://erp.jnvuiums.in/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx', { waitUntil: 'domcontentloaded' });
        
        await page.fill('#txtchallanNo', formNo);
        await page.press('#txtchallanNo', 'Enter');
        await page.waitForTimeout(1500);

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.click('#btnGetResult')
        ]);

        await download.saveAs(pdfPath);
        await browser.close();

        res.download(pdfPath, () => {
            if(fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        });

    } catch (err) {
        res.send("<h3>❌ Error: Record nahi mila ya JNVU site down hai.</h3><br><a href='/'>Wapas Try Karein</a>");
    }
});

app.listen(port, () => {
    console.log(`Server running`);
});
