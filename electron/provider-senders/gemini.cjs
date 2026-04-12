module.exports = async function sendToGemini({ webContents, message, runtime }) {
    console.log('[Gemini] Sending message...');

    const previousState = await runtime.capturePreviousResponse('gemini', { force: true });
    const previousFingerprint = previousState.fingerprint || '';

    console.log('[Gemini] Captured old response fingerprint:', previousFingerprint.substring(0, 50) + '...');

    await runtime.sleep(500);

    const inputFound = await webContents.executeJavaScript(`
        (function() {
            const selectors = [
                'rich-textarea .ql-editor',
                '.ql-editor',
                'rich-textarea [contenteditable="true"]',
                '[contenteditable="true"][aria-label*="message"]',
                '[contenteditable="true"]',
                'textarea[aria-label*="message"]',
                'textarea',
                'input[type="text"]'
            ];

            for (const selector of selectors) {
                const input = document.querySelector(selector);
                if (!input) continue;

                input.focus();
                input.click();
                return { found: true, selector };
            }

            return { found: false };
        })()
    `);

    console.log('[Gemini] Input search result:', inputFound);

    if (!inputFound.found) {
        console.log('[Gemini] No input found!');
        return { sent: false, error: 'No input field found' };
    }

    await runtime.sleep(300);

    const typeResult = await webContents.executeJavaScript(`
        (function() {
            const text = ${JSON.stringify(message)};
            const active = document.activeElement;

            if (active) {
                if (active.contentEditable === 'true' || active.isContentEditable) {
                    const paragraph = document.createElement('p');
                    paragraph.textContent = text;
                    active.appendChild(paragraph);
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    active.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, method: 'contenteditable' };
                }

                if (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') {
                    active.value = text;
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    return { success: true, method: 'input' };
                }
            }

            const qlEditor = document.querySelector('.ql-editor, rich-textarea .ql-editor');
            if (qlEditor) {
                const paragraph = document.createElement('p');
                paragraph.textContent = text;
                qlEditor.appendChild(paragraph);
                qlEditor.dispatchEvent(new Event('input', { bubbles: true }));
                return { success: true, method: 'ql-editor-fallback' };
            }

            return { success: false };
        })()
    `);

    console.log('[Gemini] Type result:', typeResult);
    await runtime.sleep(300);

    await webContents.executeJavaScript(`
        (function() {
            const input = document.querySelector('rich-textarea .ql-editor, .ql-editor, [contenteditable="true"]');
            if (input) {
                input.focus();
            }
        })()
    `);

    await runtime.sleep(100);
    await webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    await webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });

    return { sent: true };
};
