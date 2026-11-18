import calendar
import json
import struct
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
URL = "http://127.0.0.1:8050/"
KEY = "qg.calendar.crowns.v1"


def verify(browser):
    session = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    page = session.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("https://**/*", lambda route: route.abort())
    page.goto(URL + "#calendar")
    save = page.locator("#cal-save")
    expect(save).to_be_enabled()
    # Validate Hong Kong's current date independently of the host timezone.
    hk = page.evaluate("""() => new Intl.DateTimeFormat('en-CA',
      {year:'numeric', month:'2-digit', timeZone:'Asia/Hong_Kong'}).formatToParts(new Date())""")
    current = {p["type"]: p["value"] for p in hk}
    expect(page.locator("#cal-year")).to_have_value(current["year"])
    expect(page.locator("#cal-month")).to_have_value(str(int(current["month"])))
    for year, month in [(2026,5),(2026,7),(2026,11),(2026,12),(2027,1),(2027,2),(2028,2),(2026,6)]:
        page.locator("#cal-year").fill(str(year))
        page.locator("#cal-month").select_option(str(month))
        cells = page.locator("#cal-grid button")
        start, length = calendar.monthrange(year, month)
        expect(cells).to_have_count(42)
        expect(page.locator("#cal-grid button:enabled")).to_have_count(length)
        expect(cells.nth((start + 1) % 7)).to_have_attribute("aria-label", f"{month}月1日")
    def day(n):
        return page.locator(f'#cal-grid button[aria-label="6月{n}日"]')
    day(1).click()
    day(2).click()
    day(2).click()
    page.locator("#cal-month").select_option("7")
    expect(page.locator('#cal-grid [aria-pressed=true]')).to_have_count(0)
    page.reload()
    page.locator("#cal-year").fill("2026")
    page.locator("#cal-month").select_option("6")
    expect(day(1)).to_have_attribute("aria-pressed","true")
    page.locator("#tab-calendar summary").click()
    def restore(months):
        data = json.dumps({"version":1,"months":months}).encode()
        page.locator("#cal-import").set_input_files({"name":"backup.json","mimeType":"application/json","buffer":data})
    restore({"2026-06":[1,3],"2028-02":[29]})
    expect(day(3)).to_have_attribute("aria-pressed","true")
    before = page.evaluate("(key) => localStorage.getItem(key)", KEY)
    restore({"2026-06":[4],"2027-02":[29]})
    expect(page.locator("#cal-status")).to_contain_text("日期無效")
    assert page.evaluate("(key) => localStorage.getItem(key)", KEY) == before
    with page.expect_download() as backup:
        page.locator("#cal-export").click()
    assert json.loads(backup.value.path().read_bytes())["months"] == {"2026-06":[1,3],"2028-02":[29]}
    with page.expect_download() as png:
        save.click()
    assert png.value.suggested_filename == "QG-Calendar-2026-06.png"
    expect(page.locator("#qg-progress-calendar progress")).to_have_js_property("value",100)
    print("CAL_HISTORY_DIAG",page.evaluate("""async () => {
      const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('qg-card-history-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const items = await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),r=tx.objectStore('records').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      return {active:!!window.qgWorkflow,status:document.querySelector("#tab-calendar .qg-hist-status")?.textContent,count:document.querySelectorAll("#tab-calendar .qg-hist-row").length,items:items.map(x=>({id:x.id,template:x.template})),errors:[]}
    }"""))
    await page.evaluate("""async () => await window.qgWorkflow.record('calendar',{year:'2026',month:'6',days:[1]},document.getElementById('cal-preview'))""")
    print("CAL_MANUAL_HISTORY",page.locator("#tab-calendar .qg-hist-status").inner_text())

    expect(page.locator("#tab-calendar .qg-hist-load").first).to_be_visible()
    exported = png.value.path().read_bytes()
    assert struct.unpack(">II",exported[16:24]) == (1080,1350)
    import base64
    assert page.locator("#cal-preview").evaluate("""async (canvas, png) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext('2d').drawImage(image, 0, 0);
        return copy.toDataURL() === canvas.toDataURL();
    }""", base64.b64encode(exported).decode())
    page.locator("#tabBtnPromo").click()
    # Guard against the iPhone UI regression: a full-width canvas previously
    # squeezed the upload/edit buttons into a vertical sliver.
    def assert_two_columns(tab, canvas_id):
        box = page.locator(f"{tab} .promo-top").bounding_box()
        image = page.locator(f"{tab} .stage").bounding_box()
        actions = page.locator(f"{tab} .promo-tools").bounding_box()
        assert box and image and actions, f"Missing card controls: {tab}"
        assert image["width"] >= 120 and actions["width"] >= 135, (
            f"Card controls collapsed: {tab}, image={image}, actions={actions}"
        )
        assert image["x"] + image["width"] < actions["x"] + 6, (
            f"Columns overlap: {tab}, image={image}, actions={actions}"
        )
        assert actions["x"] + actions["width"] <= box["x"] + box["width"] + 2
        assert page.locator(canvas_id).is_visible()
    assert_two_columns("#tab-promo", "#cv")
    page.locator("#photo").set_input_files(ROOT / "calendar/icon.png")
    page.locator("#name").fill("幽月")
    page.locator("#ig").fill("qg_test")
    page.locator("#date").fill("2026-11-20")
    expect(page.locator("#dateout")).to_contain_text("2011")
    assert page.locator("#png").bounding_box()["y"] < 844
    with page.expect_download():
        page.locator("#png").click()
    expect(page.locator("#promoText")).to_contain_text("幽月 @qg_test")
    expect(page.locator("#promoText")).to_contain_text("降臨日期｜20 Nov 2026")
    page.locator("#promoClose").click()
    # New mobile editor UX: all modal editors have explicit exits, without losing data.
    expect(page.locator("#tab-promo h1")).to_have_text("限定居民宣傳")
    expect(page.locator("#promoPhotoExpand")).to_have_count(0)
    page.locator("#stage").click()
    expect(page.locator("#promoPhotoEditor")).to_be_visible()
    expect(page.locator("#promoPhotoEditor .qg-editor-play")).to_be_visible()
    expect(page.locator("#promoPhotoEditor .qg-photo-actions button")).to_have_count(2)
    page.locator("#promoPhotoEditor .qg-editor-done").click()
    expect(page.locator("#promoPhotoEditor")).to_be_hidden()
    page.locator("#adjOpen").click()
    expect(page.locator("#edZoom")).to_be_hidden()
    expect(page.locator("#promoEditorPlay")).to_be_visible()
    page.locator("#edDone").click()
    expect(page.locator("#qg-last-caption-promo")).to_be_visible()
    expect(page.locator("#qg-last-caption-promo")).to_contain_text("幽月 @qg_test")
    expect(page.locator("#qg-progress-promo")).to_be_visible()
    expect(page.locator("#qg-progress-promo progress")).to_have_js_property("value",100)
    expect(page.locator("#tab-promo .qg-hist-load").first).to_be_visible()
    page.locator("#tabBtnShadow").click()
    assert_two_columns("#tab-shadow", "#sh-preview")
    page.locator("#shOpenText").click()
    expect(page.locator("#shEditor")).to_be_visible()
    expect(page.locator("#shEditorFont")).to_be_visible()
    expect(page.locator("#shRangesp")).to_be_visible()
    expect(page.locator("#shEditor .qg-editor-play")).to_be_visible()
    page.locator("#shEditor .qg-editor-done").click()
    expect(page.locator("#shEditor")).to_be_hidden()
    page.locator("#sh-preview").click()
    expect(page.locator("#shPhotoEditor")).to_be_visible()
    page.locator("#shPhotoEditor .qg-editor-done").click()
    page.locator("#tabBtnWeekly").click()
    page.locator("#wkOpenText").click()
    expect(page.locator("#wkEd")).to_be_visible()
    expect(page.locator("#wkEdZoom")).to_be_hidden()
    expect(page.locator("#wkEdPlay")).to_be_visible()
    page.locator("#wkEdExit").click()
    expect(page.locator("#wkEd")).to_be_hidden()
    page.locator("#wkStart").fill("2026-12-28")
    expect(page.locator("#wkEnd")).to_have_value("2027-01-03")
    assert not errors, errors
    session.close()


if __name__ == "__main__":
    import sys
    with sync_playwright() as p:
        browser = getattr(p, sys.argv[1]).launch()
        verify(browser)
        browser.close()
