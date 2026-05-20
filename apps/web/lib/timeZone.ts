export const APP_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const APP_TIME_ZONE_LABEL = "TPHCM";

const VI_LOCALE = "vi-VN";

type DateInput = Date | string | number;
type HoChiMinhDateTimePart = "year" | "month" | "day" | "hour" | "minute" | "second";

const HO_CHI_MINH_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

function formatInHoChiMinh(value: DateInput, options: Intl.DateTimeFormatOptions) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(VI_LOCALE, {
    ...options,
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

export function formatHoChiMinhDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {}
) {
  return formatInHoChiMinh(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  });
}

export function formatHoChiMinhTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {}
) {
  return formatInHoChiMinh(value, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  });
}

export function formatHoChiMinhDateTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {}
) {
  return formatInHoChiMinh(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  });
}

function getHoChiMinhParts(date: Date): Record<HoChiMinhDateTimePart, string> {
  const parts: Partial<Record<HoChiMinhDateTimePart, string>> = {};

  for (const part of HO_CHI_MINH_PARTS_FORMATTER.formatToParts(date)) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      parts[part.type] = part.value;
    }
  }

  return {
    year: parts.year ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
    second: parts.second ?? "",
  };
}

export function formatHoChiMinhDatetimeLocal(value: DateInput) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = getHoChiMinhParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function getHoChiMinhOffsetMs(date: Date) {
  const parts = getHoChiMinhParts(date);
  const zonedTimestamp = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return zonedTimestamp - date.getTime();
}

export function parseHoChiMinhDatetimeLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText ?? "");
  const month = Number(monthText ?? "");
  const day = Number(dayText ?? "");
  const hour = Number(hourText ?? "");
  const minute = Number(minuteText ?? "");

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = getHoChiMinhOffsetMs(new Date(utcGuess));
  let result = new Date(utcGuess - offset);

  const correctedOffset = getHoChiMinhOffsetMs(result);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    result = new Date(utcGuess - offset);
  }

  return formatHoChiMinhDatetimeLocal(result) === value ? result : null;
}
