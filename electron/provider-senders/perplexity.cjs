module.exports = async function sendToPerplexity({ webContents, message, runtime }) {
    console.log('[Perplexity] Sending message...');

    const currentUrl = await webContents.executeJavaScript('window.location.href');
    if (!currentUrl.includes(runtime.providerMap.perplexity.cookieDomain)) {
        await webContents.loadURL(runtime.providerMap.perplexity.url);
        await runtime.sleep(2000);
    }

    const previousState = await runtime.capturePreviousResponse('perplexity', { force: true });
    console.log('[Perplexity] Old response data:', {
        count: previousState.blockCount || 0,
        fingerprint: (previousState.fingerprint || '').substring(0, 50) + '...'
    });

    for (let focusAttempt = 0; focusAttempt < 3; focusAttempt++) {
        await webContents.executeJavaScript(`
            (function() {
                const followUp = document.querySelector('textarea[placeholder*="follow"]') ||
                    document.querySelector('textarea[placeholder*="Ask"]');
                if (followUp) {
                    followUp.click();
                    followUp.focus();
                    return 'followUp';
                }

                const inputArea = document.querySelector('[contenteditable="true"]') ||
                    document.querySelector('textarea');
                if (inputArea) {
                    inputArea.click();
                    inputArea.focus();
                    return 'input';
                }

                return 'none';
            })()
        `);
        await runtime.sleep(300);
    }

    await runtime.sleep(500);

    const oldClipboard = runtime.clipboard.readText();
    runtime.clipboard.writeText(message);

    try {
        await webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
        await webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
        await runtime.sleep(500);
    } finally {
        runtime.clipboard.writeText(oldClipboard);
    }

    console.log('[Perplexity] Message pasted via clipboard');

    const messageInInput = await webContents.executeJavaScript(`
        (function() {
            const input = document.activeElement;
            if (!input) return '';
            return (input.value || input.textContent || '').trim();
        })()
    `).catch(() => '');

    if (!messageInInput.includes(message.substring(0, 20))) {
        console.log('[Perplexity] WARNING: Message not found in input, retrying paste...');
        runtime.clipboard.writeText(message);
        try {
            await webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
            await webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
            await runtime.sleep(500);
        } finally {
            runtime.clipboard.writeText(oldClipboard);
        }
    }

    await runtime.sleep(300);
    await webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    await webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });

    console.log('[Perplexity] Enter key sent');
    await runtime.sleep(500);

    return { sent: true, oldFingerprint: previousState.fingerprint || '' };
};
