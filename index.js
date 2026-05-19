const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

let browser;

// सर्वर क्रैश होने से बचाने के लिए ग्लोबल एरर हैंडलर
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Caught Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ Caught Uncaught Exception:', error);
});

async function initBrowser() {
    try {
        if (browser) return; // अगर पहले से चालू है तो दोबारा न खोलें
        browser = await chromium.launch({ 
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run'
            ] 
        });
        console.log("🚀 Bulletproof Browser Ready!");
    } catch (err) {
        console.error("❌ Browser Init Failed:", err.message);
    }
}

// सर्वर शुरू होते ही ब्राउज़र चालू करें
initBrowser();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- PDF Extract Logic ---
async function extractStudentInfo(pdfPath) {
    const info = { name: "Not Found", father: "Not Found", roll: "Not Found", center: "Not Found" };
    if (!fs.existsSync(pdfPath)) return info;
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
        }
        return info;
    } catch (error) {
        console.error(`Extraction Error: ${error.message}`);
        return info;
    }
}

// --- Crash Proof Download Route ---
app.post('/download', async (req, res) => {
    const formNo = req.body.form_no;
    if (!formNo || !/^\d+$/.test(formNo)) {
        return res.send("<h3>❌ Error: Invalid Form Number!</h3><a href='/'>Wapas Jao</a>");
    }

    const pdfPath = path.join(__dirname, `admit_card_${formNo}.pdf`);
    let context = null;
    let page = null;

    try {
        // सेफ्टी चेक: अगर ब्राउज़र बंद हो गया हो तो वापस चालू करो
        if (!browser || !browser.isConnected()) {
            await initBrowser();
        }

        context = await browser.newContext({ acceptDownloads: true });
        page = await context.newPage();

        // सिर्फ जरूरी चीजें लोड करो
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                return route.abort();
            }
            route.continue();
        });

        const url = "https://erp.jnvuiums.in/(S(biolzjtwlrcfmzwwzgs5uj5n))/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx#";
        
        // Timeout को 20 सेकंड किया ताकि साइट स्लो हो तो भी क्रैश न हो
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        await page.fill("#txtchallanNo", String(formNo), { force: true });
        
        const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
        
        // नॉर्मल क्लिक (बिना किसी ट्रिक के, ताकि फेल न हो)
        await page.click("#btnGetResult"); 

        const download = await downloadPromise;
        await download.saveAs(pdfPath);

    } catch (error) {
        console.error(`❌ Error for Form ${formNo}:`, error.message);
        return res.send(`<h3>❌ Error: Admit Card nahi mila ya JNVU site down hai.</h3><p>${error.message}</p><a href='/'>Wapas Try Karein</a>`);
    } finally {
        // 🔥 सबसे जरूरी हिस्सा: कुछ भी हो जाए, पेज और कॉन्टेक्स्ट बंद होने ही चाहिए ताकि RAM खाली रहे
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
    }

    // फाइल भेजने का काम Try-Catch-Finally के बाहर सुरक्षित तरीके से
    if (fs.existsSync(pdfPath)) {
        const studentData = await extractStudentInfo(pdfPath);
        console.log(`✅ Success: ${studentData.name} | Roll: ${studentData.roll}`);

        res.download(pdfPath, `JNVU_${formNo}.pdf`, () => {
            try {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); 
            } catch (err) {
                console.error("File deletion error:", err.message);
            }
        });
    } else {
        res.send("<h3>❌ Error: File save nahi ho payi.</h3><a href='/'>Wapas Try Karein</a>");
    }
});

app.listen(port, () => {
    console.log(`Web Server running on port ${port}`);
});
