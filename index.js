const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// --- Index Page ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- PDF Extract Logic ---
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

// --- Download Route (OPTIMIZED) ---
app.post('/download', async (req, res) => {
    const formNo = req.body.form_no;
    if (!formNo || !/^\d+$/.test(formNo)) {
        return res.send("<h3>❌ Error: Invalid Form Number!</h3><a href='/'>Wapas Jao</a>");
    }

    const pdfPath = path.join(__dirname, `admit_card_${formNo}.pdf`);
    let browser;

    try {
        // [OPTIMIZATION 1]: Added '--disable-features=IsolateOrigins,site-per-process' to speed up chromium launch
        browser = await chromium.launch({ 
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-features=IsolateOrigins,site-per-process'
            ] 
        });
        
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();

        // [OPTIMIZATION 2]: Aborting more heavy/unwanted assets (scripts, analytics, images)
        await page.route('**/*.{png,jpg,jpeg,gif,css,woff2,ico}', route => route.abort());
        await page.route('**/analytics/**', route => route.abort());
        await page.route('**/google-analytics/**', route => route.abort());

        const url = "https://erp.jnvuiums.in/(S(biolzjtwlrcfmzwwzgs5uj5n))/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx#";
        
        // [OPTIMIZATION 3]: 'commit' is good, but ensuring domcontentloaded can be faster for form filling
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        await page.fill("#txtchallanNo", String(formNo));
        
        const submitBtn = page.locator("#btnGetResult");
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        
        // [OPTIMIZATION 4]: Removed double click and 500ms hard delay. 
        // Single click with immediate download trigger is way faster and cleaner.
        await submitBtn.click(); 

        const download = await downloadPromise;
        await download.saveAs(pdfPath);
        await browser.close();

        if (fs.existsSync(pdfPath)) {
            const studentData = await extractStudentInfo(pdfPath);
            console.log(`\n✅ Downloaded for: ${studentData.name} | Roll: ${studentData.roll}\n`);

            res.download(pdfPath, `JNVU_${formNo}.pdf`, () => {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); 
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
