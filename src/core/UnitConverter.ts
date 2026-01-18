/**
 * ECMA-376 unit conversion constants.
 *
 * EMU (English Metric Unit) is the base unit used in OpenXML.
 * 1 inch = 914400 EMU
 * 1 point = 12700 EMU
 * 1 cm = 360000 EMU
 */

/** EMU per inch */
export const EMU_PER_INCH = 914400;

/** EMU per point (1/72 inch) */
export const EMU_PER_POINT = 12700;

/** EMU per centimeter */
export const EMU_PER_CM = 360000;

/** EMU per pixel at 96 DPI (standard Windows DPI) */
export const EMU_PER_PIXEL_96DPI = EMU_PER_INCH / 96;

/** Angle unit (60,000ths of a degree) per degree */
export const ANGLE_UNIT_PER_DEGREE = 60000;

/** Standard 4:3 slide width in EMU (10 inches) */
export const STANDARD_SLIDE_WIDTH_EMU = 9144000;

/** Standard 4:3 slide height in EMU (7.5 inches) */
export const STANDARD_SLIDE_HEIGHT_EMU = 6858000;

/** Widescreen 16:9 slide width in EMU (13.333 inches) */
export const WIDESCREEN_SLIDE_WIDTH_EMU = 12192000;

/** Widescreen 16:9 slide height in EMU (7.5 inches) */
export const WIDESCREEN_SLIDE_HEIGHT_EMU = 6858000;

/**
 * Unit converter for OpenXML coordinate transformations.
 */
export class UnitConverter {
  private readonly dpi: number;
  private readonly emuPerPixel: number;

  constructor(dpi: number = 96) {
    this.dpi = dpi;
    this.emuPerPixel = EMU_PER_INCH / dpi;
  }

  /**
   * Converts EMU to pixels at the configured DPI.
   */
  emuToPixels(emu: number): number {
    return emu / this.emuPerPixel;
  }

  /**
   * Converts pixels to EMU at the configured DPI.
   */
  pixelsToEmu(pixels: number): number {
    return pixels * this.emuPerPixel;
  }

  /**
   * Converts EMU to points (1/72 inch).
   */
  emuToPoints(emu: number): number {
    return emu / EMU_PER_POINT;
  }

  /**
   * Converts points to EMU.
   */
  pointsToEmu(points: number): number {
    return points * EMU_PER_POINT;
  }

  /**
   * Converts EMU to inches.
   */
  emuToInches(emu: number): number {
    return emu / EMU_PER_INCH;
  }

  /**
   * Converts inches to EMU.
   */
  inchesToEmu(inches: number): number {
    return inches * EMU_PER_INCH;
  }

  /**
   * Converts EMU to centimeters.
   */
  emuToCm(emu: number): number {
    return emu / EMU_PER_CM;
  }

  /**
   * Converts centimeters to EMU.
   */
  cmToEmu(cm: number): number {
    return cm * EMU_PER_CM;
  }

  /**
   * Converts OpenXML angle (60,000ths of a degree) to radians.
   */
  angleToRadians(angle: number): number {
    return (angle / ANGLE_UNIT_PER_DEGREE) * (Math.PI / 180);
  }

  /**
   * Converts OpenXML angle (60,000ths of a degree) to degrees.
   */
  angleToDegrees(angle: number): number {
    return angle / ANGLE_UNIT_PER_DEGREE;
  }

  /**
   * Converts degrees to OpenXML angle units.
   */
  degreesToAngle(degrees: number): number {
    return degrees * ANGLE_UNIT_PER_DEGREE;
  }

  /**
   * Converts radians to OpenXML angle units.
   */
  radiansToAngle(radians: number): number {
    return (radians * 180 / Math.PI) * ANGLE_UNIT_PER_DEGREE;
  }

  /**
   * Converts font size in hundredths of a point to points.
   */
  fontSizeToPoints(fontSize: number): number {
    return fontSize / 100;
  }

  /**
   * Converts points to font size in hundredths of a point.
   */
  pointsToFontSize(points: number): number {
    return points * 100;
  }

  /**
   * Converts percentage value (100000 = 100%) to decimal.
   */
  percentageToDecimal(percentage: number): number {
    return percentage / 100000;
  }

  /**
   * Converts decimal to percentage value (100000 = 100%).
   */
  decimalToPercentage(decimal: number): number {
    return decimal * 100000;
  }

  /**
   * Calculates scale factor from EMU dimensions to pixel dimensions.
   */
  calculateScaleFactor(emuWidth: number, emuHeight: number, targetWidth: number, targetHeight?: number): {
    scaleX: number;
    scaleY: number;
    width: number;
    height: number;
  } {
    const pixelWidth = this.emuToPixels(emuWidth);
    const pixelHeight = this.emuToPixels(emuHeight);
    const aspectRatio = pixelWidth / pixelHeight;

    let finalWidth: number;
    let finalHeight: number;

    if (targetHeight !== undefined) {
      finalWidth = targetWidth;
      finalHeight = targetHeight;
    } else {
      finalWidth = targetWidth;
      finalHeight = Math.round(targetWidth / aspectRatio);
    }

    return {
      scaleX: finalWidth / pixelWidth,
      scaleY: finalHeight / pixelHeight,
      width: finalWidth,
      height: finalHeight,
    };
  }

  /**
   * Gets the configured DPI.
   */
  getDpi(): number {
    return this.dpi;
  }
}

/**
 * Default unit converter instance at 96 DPI.
 */
export const defaultUnitConverter = new UnitConverter(96);

/**
 * Converts EMU to pixels at 96 DPI.
 */
export function emuToPixels(emu: number): number {
  return defaultUnitConverter.emuToPixels(emu);
}

/**
 * Converts EMU to points.
 */
export function emuToPoints(emu: number): number {
  return defaultUnitConverter.emuToPoints(emu);
}

/**
 * Converts points to EMU.
 */
export function pointsToEmu(points: number): number {
  return defaultUnitConverter.pointsToEmu(points);
}

/**
 * Converts OpenXML angle to radians.
 */
export function angleToRadians(angle: number): number {
  return defaultUnitConverter.angleToRadians(angle);
}

/**
 * Converts font size (hundredths of point) to points.
 */
export function fontSizeToPoints(fontSize: number): number {
  return defaultUnitConverter.fontSizeToPoints(fontSize);
}

/**
 * Converts percentage (100000 = 100%) to decimal.
 */
export function percentageToDecimal(percentage: number): number {
  return defaultUnitConverter.percentageToDecimal(percentage);
}
