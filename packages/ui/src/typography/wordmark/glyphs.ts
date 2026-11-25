export const letters = ["K", "i", "d", "u", "C", "o", "d", "e"] as const

export const glyphs = {
  K: { face: "M0 0H6V15L17 0H24L11 18L24 36H17L6 21V36H0Z", shade: "M6 0H17L6 15Z" },
  i: { face: "M9 0H15V6H9ZM3 12H15V30H21V36H3V30H9V18H3Z", shade: "M15 18H21V30H15Z" },
  d: { face: "M18 0H24V36H0V12H18ZM6 18V30H18V18Z", shade: "M6 18H18V30H6Z" },
  u: { face: "M0 12H6V30H18V12H24V36H0Z", shade: "M6 18H18V30H6Z" },
  C: { face: "M0 0H24V6H6V30H24V36H0Z", shade: "M6 6H24V30H6Z" },
  o: { face: "M0 12H24V36H0ZM6 18V30H18V18Z", shade: "M6 18H18V30H6Z" },
  e: { face: "M0 12H24V26H6V30H24V36H0ZM6 17V21H18V17Z", shade: "M6 26H24V30H6Z" },
} as const
