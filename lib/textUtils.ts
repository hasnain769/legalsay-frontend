/**
 * Cleans PDF-extracted text that has one word per line
 * Joins words into paragraphs while preserving structure
 */
export function cleanPdfText(rawText: string): string {
    // Step 1: Normalize line endings
    let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Step 2: Process lines and join into paragraphs
    const lines = text.split('\n');
    let result = '';
    let currentParagraph = '';
    let emptyLineCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) {
            emptyLineCount++;
            // If we see multiple empty lines (or end of content), that's a paragraph break
            if (emptyLineCount >= 2 && currentParagraph) {
                result += currentParagraph + '\n\n';
                currentParagraph = '';
            }
            continue;
        }

        // Reset empty line counter
        emptyLineCount = 0;

        // Add word to current paragraph
        if (currentParagraph) {
            currentParagraph += ' ' + line;
        } else {
            currentParagraph = line;
        }
    }

    // Add final paragraph
    if (currentParagraph) {
        result += currentParagraph;
    }

    // Step 3: Clean up multiple spaces
    text = result.replace(/ +/g, ' ');

    // Step 4: Fix spacing around punctuation
    text = text.replace(/ ([.,;:!?])/g, '$1');

    return text;
}
