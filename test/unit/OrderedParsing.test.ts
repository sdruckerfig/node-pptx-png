import { describe, it, expect } from 'vitest';
import {
  parseXmlPreservingOrder,
  getOrderedChildren,
  nodeToXmlString,
} from '../../src/core/PptxParser.js';

describe('Ordered XML Parsing', () => {
  describe('parseXmlPreservingOrder', () => {
    it('should parse XML and preserve element order', () => {
      const xml = `
        <root>
          <first>1</first>
          <second>2</second>
          <first>3</first>
        </root>
      `;

      const result = parseXmlPreservingOrder(xml);

      // Result should be an array with one element (root)
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);

      // Root should have children array
      const root = result[0];
      expect(root).toBeDefined();
      expect(root['root']).toBeDefined();
    });

    it('should maintain interleaved element order', () => {
      const xml = `
        <parent>
          <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
          <a:lnTo><a:pt x="100" y="0"/></a:lnTo>
          <a:moveTo><a:pt x="50" y="50"/></a:moveTo>
          <a:lnTo><a:pt x="150" y="50"/></a:lnTo>
        </parent>
      `;

      const result = parseXmlPreservingOrder(xml);
      const parent = result[0];
      const children = parent['parent'] as Array<Record<string, unknown>>;

      // Children should be in order: moveTo, lnTo, moveTo, lnTo
      expect(children.length).toBe(4);
      expect(Object.keys(children[0]).filter(k => k !== ':@')[0]).toBe('a:moveTo');
      expect(Object.keys(children[1]).filter(k => k !== ':@')[0]).toBe('a:lnTo');
      expect(Object.keys(children[2]).filter(k => k !== ':@')[0]).toBe('a:moveTo');
      expect(Object.keys(children[3]).filter(k => k !== ':@')[0]).toBe('a:lnTo');
    });
  });

  describe('getOrderedChildren', () => {
    it('should extract children matching specified tag names in order', () => {
      const xml = `
        <root>
          <a>first</a>
          <b>second</b>
          <a>third</a>
          <c>fourth</c>
          <b>fifth</b>
        </root>
      `;

      const parsed = parseXmlPreservingOrder(xml);
      const root = parsed[0];
      const children = root['root'] as Array<Record<string, unknown>>;

      // Filter for only 'a' and 'b' tags
      const filtered = getOrderedChildren(children, ['a', 'b']);

      expect(filtered.length).toBe(4);
      expect(filtered[0].tagName).toBe('a');
      expect(filtered[1].tagName).toBe('b');
      expect(filtered[2].tagName).toBe('a');
      expect(filtered[3].tagName).toBe('b');
    });

    it('should return empty array when no matching tags', () => {
      const xml = `
        <root>
          <a>first</a>
          <b>second</b>
        </root>
      `;

      const parsed = parseXmlPreservingOrder(xml);
      const root = parsed[0];
      const children = root['root'] as Array<Record<string, unknown>>;

      const filtered = getOrderedChildren(children, ['x', 'y', 'z']);

      expect(filtered.length).toBe(0);
    });

    it('should work with raw ordered XML for interleaved path segments', () => {
      // This tests the core functionality for path segment ordering
      // when starting from raw XML (as PptxParser.readXmlOrdered does)
      const xml = `
        <a:path>
          <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
          <a:lnTo><a:pt x="100" y="0"/></a:lnTo>
          <a:moveTo><a:pt x="50" y="50"/></a:moveTo>
          <a:lnTo><a:pt x="150" y="50"/></a:lnTo>
          <a:close/>
        </a:path>
      `;

      const parsed = parseXmlPreservingOrder(xml);
      const pathElement = parsed[0];
      const pathChildren = pathElement['a:path'] as Array<Record<string, unknown>>;

      const ordered = getOrderedChildren(
        pathChildren,
        ['a:moveTo', 'a:lnTo', 'a:close']
      );

      // Should be: moveTo, lnTo, moveTo, lnTo, close
      expect(ordered.length).toBe(5);
      expect(ordered[0].tagName).toBe('a:moveTo');
      expect(ordered[1].tagName).toBe('a:lnTo');
      expect(ordered[2].tagName).toBe('a:moveTo');
      expect(ordered[3].tagName).toBe('a:lnTo');
      expect(ordered[4].tagName).toBe('a:close');
    });

    it('should preserve z-order for shape tree elements from raw XML', () => {
      // This tests the core functionality for shape tree z-ordering
      // when starting from raw XML (as PptxParser.readXmlOrdered does)
      const xml = `
        <p:spTree>
          <p:sp><p:nvSpPr><p:cNvPr id="1"/></p:nvSpPr></p:sp>
          <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="2"/></p:nvCxnSpPr></p:cxnSp>
          <p:sp><p:nvSpPr><p:cNvPr id="3"/></p:nvSpPr></p:sp>
          <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="4"/></p:nvCxnSpPr></p:cxnSp>
        </p:spTree>
      `;

      const parsed = parseXmlPreservingOrder(xml);
      const spTreeElement = parsed[0];
      const spTreeChildren = spTreeElement['p:spTree'] as Array<Record<string, unknown>>;

      const ordered = getOrderedChildren(spTreeChildren, ['p:sp', 'p:cxnSp']);

      // Should maintain interleaved order: sp, cxnSp, sp, cxnSp
      expect(ordered.length).toBe(4);
      expect(ordered[0].tagName).toBe('p:sp');
      expect(ordered[1].tagName).toBe('p:cxnSp');
      expect(ordered[2].tagName).toBe('p:sp');
      expect(ordered[3].tagName).toBe('p:cxnSp');
    });

    it('should handle empty ordered arrays', () => {
      const ordered = getOrderedChildren([], ['a', 'b']);
      expect(ordered.length).toBe(0);
    });
  });

  describe('nodeToXmlString', () => {
    it('should convert a node back to XML string', () => {
      const node = {
        '@_attr': 'value',
        child: { '@_x': '10', '@_y': '20' },
      };

      const xmlString = nodeToXmlString(node, 'root');

      // Should contain the wrapper tag and content
      expect(xmlString).toContain('<root');
      expect(xmlString).toContain('attr="value"');
      expect(xmlString).toContain('<child');
    });
  });

  describe('Complex path ordering from raw XML', () => {
    it('should correctly order complex path with multiple sub-paths', () => {
      // Simulate a custom shape with two sub-paths (like a donut shape)
      const xml = `
        <a:path w="1000" h="1000">
          <a:moveTo><a:pt x="500" y="0"/></a:moveTo>
          <a:arcTo wR="500" hR="500" stAng="0" swAng="21600000"/>
          <a:close/>
          <a:moveTo><a:pt x="500" y="250"/></a:moveTo>
          <a:arcTo wR="250" hR="250" stAng="0" swAng="21600000"/>
          <a:close/>
        </a:path>
      `;

      const parsed = parseXmlPreservingOrder(xml);
      const pathElement = parsed[0];
      const pathChildren = pathElement['a:path'] as Array<Record<string, unknown>>;

      const ordered = getOrderedChildren(
        pathChildren,
        ['a:moveTo', 'a:lnTo', 'a:cubicBezTo', 'a:arcTo', 'a:close']
      );

      // Should be: moveTo, arcTo, close, moveTo, arcTo, close
      expect(ordered.length).toBe(6);
      expect(ordered[0].tagName).toBe('a:moveTo');
      expect(ordered[1].tagName).toBe('a:arcTo');
      expect(ordered[2].tagName).toBe('a:close');
      expect(ordered[3].tagName).toBe('a:moveTo');
      expect(ordered[4].tagName).toBe('a:arcTo');
      expect(ordered[5].tagName).toBe('a:close');
    });
  });
});
