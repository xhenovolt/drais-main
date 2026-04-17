// Shared ID card config — no server-side imports, safe for client use
export const DEFAULT_ID_CARD_CONFIG = {
  bgColor:         '#1a3a6b',
  accentColor:     '#d4a017',
  textColor:       '#ffffff',
  labelColor:      '#c8d8f0',
  footerBgColor:   '#0e2447',
  footerTextColor: '#ffffff',
  fontSize:        11,
  fontWeight:      '500',
  fontFamily:      'Inter, sans-serif',
  showDob:         true,
  showGender:      true,
  showClass:       true,
  showAdmissionNo: true,
  showSignatureLine: true,
  showFooter:      true,
  footerText:      'Property of {schoolName}',
  schoolLogoUrl:   '',
  borderRadius:    10,
  borderWidth:     0,
  borderColor:     '#000000',
  showWatermark:   false,
  watermarkText:   '',
};

export type IDCardConfig = typeof DEFAULT_ID_CARD_CONFIG;
