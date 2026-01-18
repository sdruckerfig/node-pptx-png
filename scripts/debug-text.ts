import { PptxParser, getXmlChild, getXmlChildren, getOrderedChildren, type PptxXmlNode } from '../dist/core/PptxParser.js';
import { SHAPE_ELEMENT_TYPES } from '../dist/core/constants.js';
import { createTextParser } from '../dist/parsers/TextParser.js';
import { ThemeResolver } from '../dist/theme/ThemeResolver.js';

async function main() {
  const parser = new PptxParser();
  await parser.open('./test/fixtures/test-presentation.pptx');

  const slide = await parser.getSlide(0);
  const slidePath = slide.path;

  // Get theme - use a different approach
  const themePath = 'ppt/theme/theme1.xml';
  const themeContent = await parser.readXml(themePath) as PptxXmlNode;
  const themeResolver = new ThemeResolver();
  const resolvedTheme = themeResolver.resolveTheme({ 'a:theme': themeContent });

  // Create text parser
  const textParser = createTextParser(resolvedTheme);

  // Read the ordered XML
  const orderedSlide = await parser.readXmlOrdered(slidePath);

  // Navigate to spTree
  let spTreeChildren = null;
  for (const element of orderedSlide as any[]) {
    if (element && element['p:sld']) {
      const sldChildren = element['p:sld'];
      for (const child of sldChildren) {
        if (child['p:cSld']) {
          for (const cSldChild of child['p:cSld']) {
            if (cSldChild['p:spTree']) {
              spTreeChildren = cSldChild['p:spTree'];
              break;
            }
          }
        }
      }
    }
  }

  // Get ordered shapes
  const orderedElements = getOrderedChildren(spTreeChildren, SHAPE_ELEMENT_TYPES);
  console.log('Found ' + orderedElements.length + ' shape elements\n');

  // Check all shapes for text
  for (let i = 0; i < orderedElements.length; i++) {
    const { tagName, node } = orderedElements[i];
    if (tagName === 'p:sp') {
      const nvSpPr = getXmlChild(node, 'p:nvSpPr');
      const cNvPr = nvSpPr ? getXmlChild(nvSpPr, 'p:cNvPr') : null;
      const id = cNvPr ? (cNvPr as any)['@_id'] : 'unknown';
      const name = cNvPr ? (cNvPr as any)['@_name'] : 'unknown';

      const txBody = getXmlChild(node, 'p:txBody');
      if (txBody) {
        const result = textParser.parseTextBody(txBody);
        console.log('Shape ' + i + ': id=' + id + ', name="' + name + '"');
        console.log('  Paragraphs: ' + (result && result.paragraphs ? result.paragraphs.length : 0));
        if (result && result.paragraphs) {
          for (let j = 0; j < result.paragraphs.length; j++) {
            const para = result.paragraphs[j];
            console.log('    Para ' + j + ': ' + para.runs.length + ' runs');
            for (const run of para.runs) {
              const displayText = run.text.length > 50 ? run.text.substring(0, 50) + '...' : run.text;
              console.log('      Run: "' + displayText + '"');
            }
          }
        }
        console.log('');
      }
    }
  }

  parser.close();
}

main().catch(console.error);
