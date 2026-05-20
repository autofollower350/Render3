const express = require('express');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let browser;
let context;

(async () => {

    browser = await chromium.launch({
        headless: true,

        args: [
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--mute-audio',
            '--no-first-run',
            '--disable-default-apps'
        ]
    });

    context = await browser.newContext({
        acceptDownloads: true,

        viewport: null,

        javaScriptEnabled: true,

        bypassCSP: true,

        ignoreHTTPSErrors: true
    });

    console.log("🚀 Ultra Fast Browser Ready");

})();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/download', async (req, res) => {

    const formNo = req.body.form_no;

    if (!formNo || !/^\d+$/.test(formNo)) {
        return res.send("Invalid Form Number");
    }

    let page;

    try {

        // ---------- FAST TAB ----------

        page = await context.newPage();

        // ---------- BLOCK HEAVY REQUESTS ----------

        await page.route('**/*', async (route) => {

            const request = route.request();
            const type = request.resourceType();
            const url = request.url();

            // block useless files

            if (
                type === 'image' ||
                type === 'media' ||
                type === 'font' ||
                type === 'stylesheet' ||
                url.includes('google') ||
                url.includes('analytics') ||
                url.includes('doubleclick')
            ) {
                return route.abort();
            }

            route.continue();
        });

        // ---------- ULTRA FAST LOAD ----------

        await page.goto(
            "https://erp.jnvuiums.in/(S(biolzjtwlrcfmzwwzgs5uj5n))/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx#",
            {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }
        );

        // ---------- NO EXTRA WAIT ----------

        await page.locator("#txtchallanNo").fill(formNo);

        const submitBtn = page.locator("#btnGetResult");

        // ---------- START DOWNLOAD LISTENER ----------

        const downloadPromise = page.waitForEvent('download', {
            timeout: 15000
        });

        // ---------- DOUBLE FAST CLICK ----------

        await submitBtn.click({ force: true });

        await submitBtn.click({ force: true });

        // ---------- GET PDF ----------

        const download = await downloadPromise;

        // ---------- DIRECT STREAM ----------

        const stream = await download.createReadStream();

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=JNVU_${formNo}.pdf`
        );

        res.setHeader('Content-Type', 'application/pdf');

        stream.pipe(res);

        console.log(`✅ Done: ${formNo}`);

        stream.on('end', async () => {
            try {
                await page.close();
            } catch {}
        });

    } catch (err) {

        console.log("❌", err.message);

        try {
            if (page) await page.close();
        } catch {}

        res.send(`
            <h3>❌ Error</h3>
            <p>${err.message}</p>
        `);
    }
});

app.listen(port, () => {
    console.log(`🔥 Server Running : ${port}`);
});
