module.exports = async function sendToMetaAI({ webContents, message, runtime }) {
    const previousState = await runtime.capturePreviousResponse('metaai', { force: true });
    const previousFingerprint = previousState.fingerprint || '';

    console.log('[Meta AI] Captured old response fingerprint:', previousFingerprint.substring(0, 50) + '...');

    const prepared = await webContents.executeJavaScript(`
        (function() {
            const input = document.querySelector('[role="textbox"][contenteditable="true"]') ||
                document.querySelector('[contenteditable="true"]') ||
                document.querySelector('input[placeholder*="Meta AI"]') ||
                document.querySelector('input[type="text"]');

            if (!input) {
                return { ready: false, error: 'No Meta AI input found' };
            }

            input.focus();

            if (input.matches('[contenteditable="true"], [role="textbox"]')) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    const range = document.createRange();
                    range.selectNodeContents(input);
                    range.collapse(true);
                    selection.addRange(range);
                }

                try {
                    document.execCommand('selectAll', false, null);
                    document.execCommand('delete', false, null);
                } catch (error) {}

                input.innerHTML = '';

                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, ${JSON.stringify(message)});
                } catch (error) {}

                if (!inserted) {
                    input.textContent = ${JSON.stringify(message)};
                }

                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    inputType: 'insertText',
                    data: ${JSON.stringify(message)}
                }));
            } else {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (!setter) {
                    return { ready: false, error: 'Input value setter unavailable' };
                }

                setter.call(input, '');
                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    inputType: 'deleteContentBackward',
                    data: null
                }));

                setter.call(input, ${JSON.stringify(message)});
                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    inputType: 'insertText',
                    data: ${JSON.stringify(message)}
                }));
            }

            input.dispatchEvent(new Event('change', { bubbles: true }));

            return { ready: true };
        })()
    `);

    if (!prepared?.ready) {
        return { sent: false, error: prepared?.error || 'Failed to prepare Meta AI input' };
    }

    await runtime.sleep(250);

    const clickResult = await webContents.executeJavaScript(`
        (function() {
            const isVisible = (element) => {
                if (!element) return false;
                const style = window.getComputedStyle(element);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0);
            };

            const sendButton = document.querySelector('button[aria-label="Send"]') ||
                document.querySelector('button[aria-label*="Send"]');

            if (!sendButton) {
                return { clicked: false, reason: 'No send button found' };
            }

            const ariaDisabled = sendButton.getAttribute('aria-disabled');
            const disabled = !!sendButton.disabled || sendButton.hasAttribute('disabled') || ariaDisabled === 'true';

            if (disabled || !isVisible(sendButton)) {
                return {
                    clicked: false,
                    reason: disabled ? 'Send button disabled' : 'Send button not visible'
                };
            }

            sendButton.click();
            return { clicked: true };
        })()
    `);

    if (!clickResult?.clicked) {
        await webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
        await webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    }

    return { sent: true };
};
