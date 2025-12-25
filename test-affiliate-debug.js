/**
 * Script debug để test Shopee Affiliate conversion
 * Mở browser để xem trang web hiển thị gì
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cookies từ shopee-affiliate.js
const cookies = [
    { "domain": ".affiliate.shopee.vn", "name": "_med", "path": "/", "value": "refer", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_dc_gtm_UA-61914164-6", "path": "/", "value": "1", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_fbp", "path": "/", "value": "fb.1.1765980582506.715852499659137987", "secure": false, "httpOnly": false, "sameSite": "Lax" },
    { "domain": ".shopee.vn", "name": "_ga", "path": "/", "value": "GA1.1.1227719815.1765980582", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_ga_4GPP1ZXG63", "path": "/", "value": "GS2.1.s1765980582$o1$g1$t1765985146$j60$l0$h1356058371", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_gali", "path": "/", "value": "offer%24Menu", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_gcl_au", "path": "/", "value": "1.1.727923119.1765980582", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_gid", "path": "/", "value": "GA1.2.1253651545.1765980582", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "_hjSession_868286", "path": "/", "value": "eyJpZCI6IjdhOGM5M2MyLWE1N2ItNDI2Ni1iYzkxLWQ3NWJkOWFkYzIzYyIsImMiOjE3NjU5ODIxNTY3NjAsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjoxLCJzcCI6MH0=", "secure": true, "httpOnly": false, "sameSite": "None" },
    { "domain": ".shopee.vn", "name": "_hjSessionUser_868286", "path": "/", "value": "eyJpZCI6ImIzOWI1ZWU3LWVlZTQtNTJiZC04N2Y3LTk3MGRlMGNmOWJmOCIsImNyZWF0ZWQiOjE3NjU5ODIxNTY3NTksImV4aXN0aW5nIjp0cnVlfQ==", "secure": true, "httpOnly": false, "sameSite": "None" },
    { "domain": ".shopee.vn", "name": "_med", "path": "/", "value": "refer", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "csrftoken", "path": "/", "value": "3YXyaYt8ada4ad3JhM5puiELuXBmBfyg", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "REC_T_ID", "path": "/", "value": "0d951eeb-db52-11f0-b3ea-6ac3349b565c", "secure": true, "httpOnly": true },
    { "domain": ".shopee.vn", "name": "SPC_CDS_CHAT", "path": "/", "value": "73e2677e-31ca-4a31-83eb-6bf9c9dba0bb", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "SPC_CLIENTID", "path": "/", "value": "UkU0RjBodmZRdHZ0gjzemnyxqjvjkbxn", "secure": false, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "SPC_EC", "path": "/", "value": ".cWI3cGNTT282cWlHUjRlY1kcj+5QPlmhv0rr/01+gVsj8tL32J37pNvK2AA9ZfKhleyOqKY8sG/VSgFXXEiQbQKy9WXTr+gE2rP0nEC/Aby+S9S5fsSSdDaFagCVGSYzo9AttwKNcHsijMBjL4VqeaRVckmQQ9MtQgjYfZ8s0rcUsEeflRaOxzmagP650AJsZO/r7+oacrovEqyPOLvlXscte+nGFSNbrxHgGuOsRit551Evog88FpsZKdzIzw/cat/8Gas7uPOm+tDoKMH5Z0bgqpvj8aAgHqErzUHJYNk=", "secure": true, "httpOnly": true },
    { "domain": ".shopee.vn", "name": "SPC_F", "path": "/", "value": "RE4F0hvfQtvtIAjubKFzt4rdaHum4qsC", "secure": true, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "SPC_R_T_ID", "path": "/", "value": "CtXL7WJ2317bDtadxdAzHIF/HiLkJsNKa4mN2EEmQMYkOeWSd1Y7mZfZzaFvswuT4yUZ0q8S+tKcMeRkbZFWwebW+b3dOGbABxyxw9dU+i41VItzuU0fSKq7QFUpumtf1ZuTylH6BcC/wep/wAvH+HZyRthYTWpstpqpRwo2MRk=", "secure": true, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "SPC_R_T_IV", "path": "/", "value": "cHVZTW90YThqUkptZmZoMQ==", "secure": true, "httpOnly": false },
    { "domain": ".shopee.vn", "name": "SPC_SI", "path": "/", "value": "0zgtaQAAAAA1OUJDWUgwSppeMgIAAAAARThpUmxydmo=", "secure": true, "httpOnly": true },
    { "domain": ".shopee.vn", "name": "SPC_ST", "path": "/", "value": ".ajNXSzJMT21IYllrTG01VcmyDmsE2lDrrH/f5BzogETdKSSa0Kw5B9/jIsaznmHnPtM2/+G4jj2r24zENymW/B5WOkFRIoqpuHNyt+8CK4lWh/WXkZNAWHiiISZ6SrNPRUpAs/xmQb3OwAQkvEjuVxLBH8qTkM8BFVOzAM1EC6VhN9zpC9U6jkBHskA3ShUWh6bW2DpGZZYpUZn+JxQEM+WCI/e1hYdiuZGovkLXpwbPocCVM2FqrYzunml80lX+nuDMHMjTbAnEZ3f/a3CzkU6JGBHHZsXsIt3WKYpokyM=", "secure": true, "httpOnly": true },
    { "domain": ".shopee.vn", "name": "SPC_T_ID", "path": "/", "value": "CtXL7WJ2317bDtadxdAzHIF/HiLkJsNKa4mN2EEmQMYkOeWSd1Y7mZfZzaFvswuT4yUZ0q8S+tKcMeRkbZFWwebW+b3dOGbABxyxw9dU+i41VItzuU0fSKq7QFUpumtf1ZuTylH6BcC/wep/wAvH+HZyRthYTWpstpqpRwo2MRk=", "secure": true, "httpOnly": true },
    { "domain": ".shopee.vn", "name": "SPC_T_IV", "path": "/", "value": "cHVZTW90YThqUkptZmZoMQ==", "secure": true, "httpOnly": true },
    { "domain": ".shopee.vn", "name": "SPC_U", "path": "/", "value": "1657617031", "secure": true, "httpOnly": false },
    { "domain": "affiliate.shopee.vn", "name": "_QPWSDCXHZQA", "path": "/", "value": "ef344ef8-1dab-45e0-f77d-99f74b30c958", "secure": false, "httpOnly": false },
    { "domain": "affiliate.shopee.vn", "name": "_sapid", "path": "/", "value": "564952bffef010d653149ebd459919d445da1a3dd80a0b93f3582566", "secure": false, "httpOnly": false },
    { "domain": "affiliate.shopee.vn", "name": "ds", "path": "/", "value": "4d00f4f2da60708971e1ec56f432766d", "secure": false, "httpOnly": false },
    { "domain": "affiliate.shopee.vn", "name": "language", "path": "/", "value": "vi", "secure": false, "httpOnly": false },
    { "domain": "affiliate.shopee.vn", "name": "REC7iLP4Q", "path": "/", "value": "4ff743f8-66df-45ad-b3a2-1b51e99331fd", "secure": false, "httpOnly": false },
    { "domain": "affiliate.shopee.vn", "name": "shopee_webUnique_ccd", "path": "/", "value": "8gXCSRO%2F5VJ89baYV%2BqJnA%3D%3D%7CgKnX6MZ%2BQydoUMmurodmfLB8ivZFV96BK0%2BTn8MCIFikDh29PZ1PwUrqqv48gqXZbxjgjQsk%2FSSLB60%3D%7CsSN%2FESTF9Ro7KDTp%7C08%7C3", "secure": false, "httpOnly": false }
];

async function main() {
    console.log('🚀 Đang khởi động browser...');

    const browser = await puppeteer.launch({
        headless: false,           // Hiển thị browser để debug
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();

    console.log('🍪 Đang set cookies...');
    for (const cookie of cookies) {
        try {
            await page.setCookie(cookie);
        } catch (err) {
            console.log(`⚠️ Không thể set cookie ${cookie.name}`);
        }
    }

    console.log('🌐 Đang truy cập trang Shopee Affiliate...');
    await page.goto('https://affiliate.shopee.vn/offer/custom_link', {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log('✅ Đã mở trang! Kiểm tra xem có textarea không...');
    
    // Chờ 5 giây để xem trang
    await delay(5000);

    // Thử tìm textarea
    try {
        const textarea = await page.waitForSelector('::-p-xpath(//textarea)', { timeout: 5000 });
        console.log('✅ Tìm thấy textarea!');
    } catch (err) {
        console.log('❌ KHÔNG tìm thấy textarea!');
        console.log('💡 Có thể cookies đã hết hạn hoặc cần đăng nhập lại.');
    }

    console.log('');
    console.log('📌 Browser sẽ được giữ mở. Nhấn Ctrl+C để đóng.');
}

main().catch(err => {
    console.error('❌ Lỗi:', err.message);
});

