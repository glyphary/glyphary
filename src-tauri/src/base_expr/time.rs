//! Durations, civil dates, and date formatting for the expression engine.
//!
//! Responsibilities:
//! - Parse and print durations (`1d`, `2 weeks`), convert between instants and
//!   civil wall-clock fields, and format dates with Moment-style tokens.
//!
//! Contracts:
//! - Proleptic Gregorian arithmetic with no timezone database; callers pass a
//!   fixed offset. Months and years in durations are 30 and 365 days.
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

const MS_SECOND: i64 = 1000;
const MS_MINUTE: i64 = 60 * MS_SECOND;
const MS_HOUR: i64 = 60 * MS_MINUTE;
const MS_DAY: i64 = 24 * MS_HOUR;
const MS_WEEK: i64 = 7 * MS_DAY;
// ponytail: calendar months and years are fixed lengths here, not date math.
const MS_MONTH: i64 = 30 * MS_DAY;
const MS_YEAR: i64 = 365 * MS_DAY;

/// Reads `1d`, `2 weeks`, `1M 4h 3m`, `-30s` and similar into milliseconds.
pub(crate) fn parse_duration(text: &str) -> Option<i64> {
    let mut total = 0i64;
    let mut found = false;
    let mut rest = text.trim();

    while !rest.is_empty() {
        let number_end = rest
            .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+'))
            .unwrap_or(rest.len());
        let amount: f64 = rest[..number_end].parse().ok()?;
        rest = rest[number_end..].trim_start();
        let unit_end = rest
            .find(|c: char| !c.is_alphabetic())
            .unwrap_or(rest.len());
        let unit = &rest[..unit_end];
        rest = rest[unit_end..].trim_start().trim_start_matches(',').trim_start();
        // Case matters for one pair: `M` is months, `m` is minutes, as in Moment.
        let unit_ms = match unit {
            "ms" | "millisecond" | "milliseconds" => 1,
            "s" | "sec" | "secs" | "second" | "seconds" => MS_SECOND,
            "m" | "min" | "mins" | "minute" | "minutes" => MS_MINUTE,
            "h" | "hr" | "hrs" | "hour" | "hours" => MS_HOUR,
            "d" | "day" | "days" => MS_DAY,
            "w" | "wk" | "week" | "weeks" => MS_WEEK,
            "M" | "mo" | "month" | "months" => MS_MONTH,
            "y" | "yr" | "year" | "years" => MS_YEAR,
            _ => return None,
        };
        total += (amount * unit_ms as f64) as i64;
        found = true;
    }

    found.then_some(total)
}

pub(super) fn format_duration(ms: i64) -> String {
    let sign = if ms < 0 { "-" } else { "" };
    let mut remaining = ms.abs();
    let units = [
        (MS_YEAR, "year"),
        (MS_MONTH, "month"),
        (MS_WEEK, "week"),
        (MS_DAY, "day"),
        (MS_HOUR, "hour"),
        (MS_MINUTE, "minute"),
        (MS_SECOND, "second"),
    ];
    let mut parts = Vec::new();

    // Two units is what people read as a duration; "1 year 2 months" beats
    // "1 year 2 months 3 days 4 hours".
    for (unit_ms, label) in units {
        if remaining >= unit_ms && parts.len() < 2 {
            let count = remaining / unit_ms;
            remaining %= unit_ms;
            parts.push(format!("{count} {label}{}", if count == 1 { "" } else { "s" }));
        }
    }

    if parts.is_empty() {
        return format!("{sign}{} ms", ms.abs());
    }

    format!("{sign}{}", parts.join(" "))
}

pub(super) fn relative_time(delta_ms: i64) -> String {
    if delta_ms.abs() < MS_MINUTE {
        return "just now".into();
    }
    let text = format_duration(delta_ms.abs());
    let text = text.split(' ').take(2).collect::<Vec<_>>().join(" ");
    if delta_ms < 0 {
        format!("{text} ago")
    } else {
        format!("in {text}")
    }
}

pub(crate) struct Civil {
    pub(crate) year: i64,
    pub(crate) month: u32,
    pub(crate) day: u32,
    pub(crate) hour: u32,
    pub(crate) minute: u32,
    pub(crate) second: u32,
    pub(crate) millisecond: u32,
    pub(crate) weekday: u32,
}

/// Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm).
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_index = (month as i64 + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + day as i64 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let days = days + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

pub(crate) fn civil_to_wall_ms(year: i64, month: u32, day: u32, hour: u32, minute: u32, second: u32) -> i64 {
    days_from_civil(year, month, day) * MS_DAY
        + hour as i64 * MS_HOUR
        + minute as i64 * MS_MINUTE
        + second as i64 * MS_SECOND
}

impl Civil {
    pub(crate) fn from_instant(instant: i64, tz_offset_ms: i64) -> Self {
        let wall = instant + tz_offset_ms;
        let days = wall.div_euclid(MS_DAY);
        let remainder = wall.rem_euclid(MS_DAY);
        let (year, month, day) = civil_from_days(days);
        Self {
            year,
            month,
            day,
            hour: (remainder / MS_HOUR) as u32,
            minute: ((remainder % MS_HOUR) / MS_MINUTE) as u32,
            second: ((remainder % MS_MINUTE) / MS_SECOND) as u32,
            millisecond: (remainder % MS_SECOND) as u32,
            // 1970-01-01 was a Thursday.
            weekday: ((days + 4).rem_euclid(7)) as u32,
        }
    }
}

/// Reads `YYYY-MM-DD`, optionally followed by `T` or a space and `HH:mm[:ss]`,
/// into wall-clock milliseconds (no offset applied).
pub(crate) fn parse_wall_clock(text: &str) -> Option<i64> {
    let text = text.trim();
    let (date, time) = match text.split_once(|c| c == 'T' || c == ' ') {
        Some((date, time)) => (date, Some(time)),
        None => (text, None),
    };
    let mut parts = date.split('-');
    let year: i64 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;

    if parts.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let (hour, minute, second) = match time {
        Some(time) => {
            let time = time.trim_end_matches('Z');
            let time = time.split(['+', '.']).next().unwrap_or(time);
            let mut parts = time.split(':');
            let hour: u32 = parts.next()?.trim().parse().ok()?;
            let minute: u32 = parts.next().unwrap_or("0").parse().ok()?;
            let second: u32 = parts.next().unwrap_or("0").parse().ok()?;
            (hour, minute, second)
        }
        None => (0, 0, 0),
    };

    Some(civil_to_wall_ms(year, month, day, hour, minute, second))
}

const MONTHS: [&str; 12] = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
];
const WEEKDAYS: [&str; 7] = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/// Moment-style tokens: YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm m ss s
/// SSS A a, with `[literal]` escapes. Anything else is copied through.
pub(super) fn format_date(civil: &Civil, pattern: &str) -> String {
    let chars: Vec<char> = pattern.chars().collect();
    let mut output = String::new();
    let mut index = 0;
    let tokens: [(&str, fn(&Civil) -> String); 18] = [
        ("YYYY", |c| format!("{:04}", c.year)),
        ("YY", |c| format!("{:02}", c.year.rem_euclid(100))),
        ("MMMM", |c| MONTHS[c.month as usize - 1].to_string()),
        ("MMM", |c| MONTHS[c.month as usize - 1][..3].to_string()),
        ("MM", |c| format!("{:02}", c.month)),
        ("M", |c| c.month.to_string()),
        ("DD", |c| format!("{:02}", c.day)),
        ("D", |c| c.day.to_string()),
        ("dddd", |c| WEEKDAYS[c.weekday as usize].to_string()),
        ("ddd", |c| WEEKDAYS[c.weekday as usize][..3].to_string()),
        ("HH", |c| format!("{:02}", c.hour)),
        ("H", |c| c.hour.to_string()),
        ("hh", |c| format!("{:02}", twelve_hour(c.hour))),
        ("h", |c| twelve_hour(c.hour).to_string()),
        ("mm", |c| format!("{:02}", c.minute)),
        ("m", |c| c.minute.to_string()),
        ("ss", |c| format!("{:02}", c.second)),
        ("SSS", |c| format!("{:03}", c.millisecond)),
    ];

    while index < chars.len() {
        if chars[index] == '[' {
            let end = chars[index..]
                .iter()
                .position(|c| *c == ']')
                .map(|offset| index + offset)
                .unwrap_or(chars.len());
            output.extend(&chars[index + 1..end]);
            index = end + 1;
            continue;
        }

        let rest: String = chars[index..].iter().collect();
        if let Some((token, render)) = tokens.iter().find(|(token, _)| rest.starts_with(token)) {
            output.push_str(&render(civil));
            index += token.len();
        } else if rest.starts_with('s') {
            output.push_str(&civil.second.to_string());
            index += 1;
        } else if rest.starts_with('A') || rest.starts_with('a') {
            let meridiem = match (civil.hour < 12, chars[index] == 'a') {
                (true, true) => "am",
                (true, false) => "AM",
                (false, true) => "pm",
                (false, false) => "PM",
            };
            output.push_str(meridiem);
            index += 1;
        } else {
            output.push(chars[index]);
            index += 1;
        }
    }

    output
}

fn twelve_hour(hour: u32) -> u32 {
    match hour % 12 {
        0 => 12,
        other => other,
    }
}
