const express = require('express');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// ---------------- GLOBAL BROWSER ----------------

let browser;
let context;

(async () => {
    browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    });

    context = await browser.newContext({
        acceptDownloads: true
    });

    console.log("✅ Browser Ready");
})();

// ---------------- HOME PAGE ----------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------- DOWNLOAD ROUTE ----------------

app.post('/download', async (req, res) => {

    const formNo = req.body.form_no;

    if (!formNo || !/^\d+$/.test(formNo)) {
        return res.send(`
            <h3>❌ Invalid Form Number</h3>
            <a href="/">Wapas Jao</a>
        `);
    }

    let page;

    try {

        // -------- NEW FAST TAB --------

        page = await context.newPage();

        // -------- BLOCK HEAVY FILES --------

        await page.route('**/*', (route) => {

            const type = route.request().resourceType();

            if (
                type === 'image' ||
                type === 'stylesheet' ||
                type === 'font' ||
                type === 'media'
            ) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // -------- WEBSITE --------

        const url =
            "https://erp.jnvuiums.in/(S(biolzjtwlrcfmzwwzgs5uj5n))/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx#";

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        // -------- FORM FILL --------

        await page.fill("#txtchallanNo", String(formNo));

        const submitBtn = page.locator("#btnGetResult");

        // -------- DOWNLOAD LISTENER --------

        const downloadPromise = page.waitForEvent('download', {
            timeout: 20000
        });

        // -------- DOUBLE CLICK SYSTEM --------

        await submitBtn.click();

        await page.waitForTimeout(300);

        await submitBtn.click();

        // -------- GET DOWNLOAD --------

        const download = await downloadPromise;

        // -------- DIRECT STREAM (NO SAVEAS) --------

        const stream = await download.createReadStream();

        // -------- SEND PDF --------

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=JNVU_${formNo}.pdf`
        );

        res.setHeader('Content-Type', 'application/pdf');

        stream.pipe(res);

        console.log(`✅ PDF Sent: ${formNo}`);

        // -------- AUTO CLOSE TAB --------

        stream.on('end', async () => {
            try {
                await page.close();
            } catch (e) {}
        });

    } catch (error) {

        console.log("❌ Error:", error.message);

        if (page) {
            try {
                await page.close();
            } catch (e) {}
        }

        res.send(`
            <h3>❌ Admit Card nahi mila ya website slow hai</h3>
            <p>${error.message}</p>
            <a href="/">Wapas Try Karein</a>
        `);
    }
});

// ---------------- START SERVER ----------------

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
