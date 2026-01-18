import { describe, it, expect } from 'vitest';
import {
  UnitConverter,
  emuToPixels,
  emuToPoints,
  pointsToEmu,
  angleToRadians,
  fontSizeToPoints,
  percentageToDecimal,
  EMU_PER_INCH,
  EMU_PER_POINT,
} from '../../src/core/UnitConverter.js';

describe('UnitConverter', () => {
  describe('EMU conversions', () => {
    it('should convert EMU to pixels at 96 DPI', () => {
      const converter = new UnitConverter(96);
      // 1 inch = 914400 EMU = 96 pixels at 96 DPI
      expect(converter.emuToPixels(EMU_PER_INCH)).toBe(96);
    });

    it('should convert pixels to EMU at 96 DPI', () => {
      const converter = new UnitConverter(96);
      expect(converter.pixelsToEmu(96)).toBe(EMU_PER_INCH);
    });

    it('should convert EMU to points', () => {
      const converter = new UnitConverter();
      // 1 point = 12700 EMU
      expect(converter.emuToPoints(EMU_PER_POINT)).toBe(1);
      expect(converter.emuToPoints(EMU_PER_POINT * 12)).toBe(12);
    });

    it('should convert points to EMU', () => {
      const converter = new UnitConverter();
      expect(converter.pointsToEmu(1)).toBe(EMU_PER_POINT);
      expect(converter.pointsToEmu(72)).toBe(EMU_PER_INCH);
    });

    it('should convert EMU to inches', () => {
      const converter = new UnitConverter();
      expect(converter.emuToInches(EMU_PER_INCH)).toBe(1);
      expect(converter.emuToInches(EMU_PER_INCH * 10)).toBe(10);
    });
  });

  describe('Angle conversions', () => {
    it('should convert OpenXML angles to radians', () => {
      const converter = new UnitConverter();
      // 60000 units = 1 degree
      expect(converter.angleToRadians(0)).toBe(0);
      expect(converter.angleToRadians(60000 * 180)).toBeCloseTo(Math.PI, 5);
      expect(converter.angleToRadians(60000 * 360)).toBeCloseTo(2 * Math.PI, 5);
    });

    it('should convert OpenXML angles to degrees', () => {
      const converter = new UnitConverter();
      expect(converter.angleToDegrees(60000)).toBe(1);
      expect(converter.angleToDegrees(60000 * 90)).toBe(90);
      expect(converter.angleToDegrees(60000 * 360)).toBe(360);
    });
  });

  describe('Font size conversions', () => {
    it('should convert font size to points', () => {
      const converter = new UnitConverter();
      // Font sizes in OpenXML are in hundredths of a point
      expect(converter.fontSizeToPoints(1200)).toBe(12);
      expect(converter.fontSizeToPoints(1800)).toBe(18);
      expect(converter.fontSizeToPoints(2400)).toBe(24);
    });

    it('should convert points to font size', () => {
      const converter = new UnitConverter();
      expect(converter.pointsToFontSize(12)).toBe(1200);
      expect(converter.pointsToFontSize(18)).toBe(1800);
    });
  });

  describe('Percentage conversions', () => {
    it('should convert percentage to decimal', () => {
      const converter = new UnitConverter();
      expect(converter.percentageToDecimal(100000)).toBe(1);
      expect(converter.percentageToDecimal(50000)).toBe(0.5);
      expect(converter.percentageToDecimal(0)).toBe(0);
    });

    it('should convert decimal to percentage', () => {
      const converter = new UnitConverter();
      expect(converter.decimalToPercentage(1)).toBe(100000);
      expect(converter.decimalToPercentage(0.5)).toBe(50000);
    });
  });

  describe('Scale factor calculation', () => {
    it('should calculate scale factors for target dimensions', () => {
      const converter = new UnitConverter(96);
      const slideWidth = 9144000; // 10 inches = 960 pixels at 96 DPI
      const slideHeight = 6858000; // 7.5 inches = 720 pixels at 96 DPI

      const result = converter.calculateScaleFactor(slideWidth, slideHeight, 1920);

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1440); // Maintains 4:3 aspect ratio
      expect(result.scaleX).toBeCloseTo(2, 2);
      expect(result.scaleY).toBeCloseTo(2, 2);
    });

    it('should use explicit height when provided', () => {
      const converter = new UnitConverter(96);
      const slideWidth = 9144000;
      const slideHeight = 6858000;

      const result = converter.calculateScaleFactor(slideWidth, slideHeight, 1920, 1080);

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });
  });

  describe('Convenience functions', () => {
    it('should provide working convenience functions', () => {
      expect(emuToPixels(EMU_PER_INCH)).toBe(96);
      expect(emuToPoints(EMU_PER_POINT)).toBe(1);
      expect(pointsToEmu(1)).toBe(EMU_PER_POINT);
      expect(angleToRadians(60000 * 180)).toBeCloseTo(Math.PI, 5);
      expect(fontSizeToPoints(1200)).toBe(12);
      expect(percentageToDecimal(100000)).toBe(1);
    });
  });
});
