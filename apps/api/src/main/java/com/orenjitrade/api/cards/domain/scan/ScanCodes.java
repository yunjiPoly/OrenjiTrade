package com.orenjitrade.api.cards.domain.scan;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The printing codes a scan read, as the catalog can look them up (owner spec 2026-10-15, section
 * 3.5). Pure and deterministic.
 *
 * <ul>
 *   <li>{@link #clean}: upper case, no spaces, the dash look-alikes read as {@code -}, only {@code
 *       A-Z 0-9 -} kept (the phone cleans the same way; the server does it again).
 *   <li>{@link #exactForms}: the code as read, a missing dash tried at each place it could go (a
 *       set part of 2 to 5 characters), and the other form of an old code ({@code LOB-005 ↔
 *       LOB-EN005}, {@code LOB-E001 → LOB-EN001}).
 *   <li>{@link #lookAlikes}: the strict look-alike variants (O↔0, D↔0, I↔1, L↔1, S↔5, B↔8, Z↔2,
 *       G↔6): letters become digits in the number part, digits become letters in the region, both
 *       ways in the set part; the fewest swaps first, at most {@value #MAX_LOOK_ALIKES} per code
 *       read. A variant only counts when the catalog has it.
 *   <li>{@link #neighbours}: the codes one look-alike character away, the wider look-alikes 3/8,
 *       6/8, 5/6, 0/8 and 1/7 included: shown as other matches, never accepted on their own.
 *   <li>{@link #otherLanguage}: a code with another language's region ({@code MACR-FR036}, the old
 *       {@code LOB-F001}), also when the region was read with look-alike characters ({@code
 *       MACR-0E036}, {@code LOB-5001}). English cards only: such a read is never matched, not even
 *       through its English code.
 *   <li>{@link #languageInDoubt}: a read without its dash where one place of the dash gives another
 *       language's code and another an English one ({@code VLBDE005}: {@code VLB-DE005} or {@code
 *       VLBD-E005}): English only when the catalog has one of its {@link #englishForms} as read
 *       ({@code MRDE001} is {@code MRD-E001}), otherwise another language's.
 *   <li>{@link #isPasscode}: the card's 8-digit passcode (or a stat) is never looked up, not even
 *       read with a stray dash or two look-alike letters.
 * </ul>
 */
public final class ScanCodes {

    /** Strict look-alike variants of one code read (all its forms together). */
    public static final int MAX_LOOK_ALIKES = 64;

    /** Codes one look-alike character away, per code read. */
    public static final int MAX_NEIGHBOURS = 32;

    /** Longest cleaned code worth looking at (the longest real codes have 10 characters). */
    static final int MAX_LENGTH = 16;

    /** A code with one dash: a set part, then the region and the number. */
    static final Pattern CODE = Pattern.compile("^([A-Z0-9]{2,10})-([A-Z0-9]{2,8})$");

    /**
     * An English code: EN (or {@code E}, old Europe prints) and 2 or 3 digits, sometimes after one
     * letter ({@code LAVD-ENS08}); or 2 or 3 digits without a region (old North American prints).
     */
    static final Pattern ENGLISH =
            Pattern.compile("^[A-Z0-9]{2,10}-(?:(?:EN|E)[A-Z]?[0-9]{2,3}|[0-9]{2,3})$");

    /**
     * Another language's region: FR, DE, IT, SP, PT (and JP, KR), or the old one-letter regions F,
     * G, I, S, P followed by three digits.
     */
    static final Pattern OTHER_LANGUAGE =
            Pattern.compile(
                    "^[A-Z0-9]{2,10}-(?:(?:FR|DE|IT|SP|PT|JP|KR)[A-Z0-9]{2,4}|[FGISP][0-9]{3})$");

    /** The two-letter regions of other languages. */
    private static final Set<String> OTHER_REGIONS =
            Set.of("FR", "DE", "IT", "SP", "PT", "JP", "KR");

    /** The old one-letter regions of other languages (before three digits). */
    private static final String OTHER_OLD_REGIONS = "FGISP";

    /**
     * A number read with look-alike letters for some digits (at least one real digit): after a
     * two-letter region, 2 or 3 of them, sometimes after one letter.
     */
    private static final Pattern MISREAD_NUMBER = Pattern.compile("^[A-Z]?[0-9ODILSBZG]{2,3}$");

    /** The same, after an old one-letter region: three of them. */
    private static final Pattern MISREAD_OLD_NUMBER = Pattern.compile("^[0-9ODILSBZG]{3}$");

    /** An English part after the dash, read with look-alike letters for some digits. */
    private static final Pattern MISREAD_ENGLISH =
            Pattern.compile("^(?:(?:EN|E)[A-Z]?[0-9ODILSBZG]{2,3}|[0-9ODILSBZG]{2,3})$");

    private static final Pattern OLD_NUMBER = Pattern.compile("^[0-9]{2,3}$");
    private static final Pattern ANY_DIGIT = Pattern.compile("[0-9]");
    private static final Pattern NO_LETTER = Pattern.compile("^[0-9-]+$");
    private static final Pattern OLD_EUROPE = Pattern.compile("^E([0-9]{2,3})$");
    private static final Pattern OLD_ENGLISH = Pattern.compile("^EN([0-9]{2,3})$");

    /** Strict look-alikes, letter to digit. */
    private static final Map<Character, String> LETTER_TO_DIGIT =
            Map.of('O', "0", 'D', "0", 'I', "1", 'L', "1", 'S', "5", 'B', "8", 'Z', "2", 'G', "6");

    /** Strict look-alikes, digit to letter. */
    private static final Map<Character, String> DIGIT_TO_LETTER =
            Map.of('0', "OD", '1', "IL", '5', "S", '8', "B", '2', "Z", '6', "G");

    /** The wider look-alikes (digit to digit): shown, never accepted on their own. */
    private static final Map<Character, String> WIDE =
            Map.of('3', "8", '8', "360", '6', "85", '5', "6", '0', "8", '1', "7", '7', "1");

    private ScanCodes() {}

    // ---------------------------------------------------------------------------------------
    // Cleaning
    // ---------------------------------------------------------------------------------------

    /**
     * Upper-cases a code read and removes the spaces; the dashes, underscores, dots and tildes
     * between its parts become {@code -}; only {@code A-Z}, {@code 0-9} and {@code -} stay. Never
     * swaps letters and digits.
     */
    public static String clean(String raw) {
        String upper = raw.toUpperCase(Locale.ROOT);
        StringBuilder cleaned = new StringBuilder(upper.length());
        for (int i = 0; i < upper.length(); i++) {
            char c = upper.charAt(i);
            if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
                cleaned.append(c);
            } else if (isDash(c)) {
                if (cleaned.length() > 0 && cleaned.charAt(cleaned.length() - 1) != '-') {
                    cleaned.append('-');
                }
            }
        }
        int end = cleaned.length();
        while (end > 0 && cleaned.charAt(end - 1) == '-') {
            end--;
        }
        return cleaned.substring(0, end);
    }

    private static boolean isDash(char c) {
        return c == '-'
                || c == '_'
                || c == '.'
                || c == '~'
                || c == '‐' // hyphen
                || c == '‑' // non-breaking hyphen
                || c == '‒' // figure dash
                || c == '–' // en dash
                || c == '—' // em dash
                || c == '−' // minus sign
                || c == '－'; // full-width hyphen-minus
    }

    // ---------------------------------------------------------------------------------------
    // Language
    // ---------------------------------------------------------------------------------------

    /** Whether a full code (one dash) carries another language's region. */
    public static boolean isOtherLanguage(String code) {
        return OTHER_LANGUAGE.matcher(code).matches();
    }

    /** Whether a full code (one dash) is shaped like an English code and no other language's. */
    public static boolean isEnglish(String code) {
        return ENGLISH.matcher(code).matches() && !isOtherLanguage(code);
    }

    /**
     * Whether a cleaned code read carries another language's region, as printed or misread: its one
     * dash form does, or, read without a dash, some place of the dash gives another language's code
     * and none gives an English one ({@code MACRFR036} is French, {@code MRDE001} may be {@code
     * MRD-E001}).
     *
     * <p>A region read with look-alike characters counts ({@link #misreadOtherLanguage}): {@code
     * VLB-0E005} is German and {@code VLB-1T005} Italian, whatever the name read says. E and N have
     * no look-alike, so no English region is ever read as another language's.
     */
    public static boolean otherLanguage(String cleaned) {
        List<String> bases = bases(cleaned);
        return bases.stream().anyMatch(ScanCodes::anotherLanguagesBase)
                && bases.stream().noneMatch(ScanCodes::mayBeEnglish);
    }

    /**
     * Whether a cleaned code read may be another language's or English depending on where its dash
     * goes: read without its dash (or with dashes that are not one region's), one place of the dash
     * gives another language's code, as printed or misread, and another place an English one
     * ({@code VLBDE005} is {@code VLB-DE005} or {@code VLBD-E005}, {@code MRDE001} is {@code
     * MR-DE001} or {@code MRD-E001}). The catalog decides: English only when it has one of the
     * {@link #englishForms} as read, otherwise another language's (owner spec 2026-10-15, section
     * 3.5, rule 5: never matched through its English code nor as a look-alike).
     */
    public static boolean languageInDoubt(String cleaned) {
        List<String> bases = bases(cleaned);
        return bases.stream().anyMatch(ScanCodes::anotherLanguagesBase)
                && bases.stream().anyMatch(ScanCodes::mayBeEnglish);
    }

    /**
     * The English codes a read in doubt ({@link #languageInDoubt}) may be, best first: each place
     * of the dash that may be English, with the other form of an old code; the places that give
     * another language's code (or no code shape) are left out.
     */
    public static List<String> englishForms(String cleaned) {
        Set<String> forms = new LinkedHashSet<>();
        for (String base : bases(cleaned)) {
            if (mayBeEnglish(base)) {
                forms.add(base);
                forms.addAll(oldForms(base));
            }
        }
        return List.copyOf(forms);
    }

    private static boolean anotherLanguagesBase(String base) {
        return isOtherLanguage(base) || misreadOtherLanguage(base);
    }

    /**
     * Whether a full code (one dash) is another language's when its region is read with the strict
     * look-alikes: a digit there is a letter (0 O/D, 1 I/L, 2 Z, 5 S, 6 G, 8 B) and I/L or O/D may
     * be each other ({@code 0E} DE, {@code 1T} or {@code LT} IT, {@code 5P} SP; the old {@code 5},
     * {@code 1}, {@code L}, {@code 6} S, I, G), and the number after it is 2 or 3 digits (3 after
     * an old region) with look-alike letters for some of them but at least one real digit.
     */
    static boolean misreadOtherLanguage(String code) {
        Matcher parts = CODE.matcher(code);
        if (!parts.matches()) {
            return false;
        }
        String rest = parts.group(2);
        if (rest.length() >= 4 && rest.length() <= 6) {
            String number = rest.substring(2);
            for (char first : regionLetters(rest.charAt(0)).toCharArray()) {
                for (char second : regionLetters(rest.charAt(1)).toCharArray()) {
                    if (OTHER_REGIONS.contains("" + first + second)
                            && MISREAD_NUMBER.matcher(number).matches()
                            && ANY_DIGIT.matcher(number).find()) {
                        return true;
                    }
                }
            }
        }
        if (rest.length() == 4) {
            String number = rest.substring(1);
            for (char region : regionLetters(rest.charAt(0)).toCharArray()) {
                if (OTHER_OLD_REGIONS.indexOf(region) >= 0
                        && MISREAD_OLD_NUMBER.matcher(number).matches()
                        && ANY_DIGIT.matcher(number).find()) {
                    return true;
                }
            }
        }
        return false;
    }

    /** A region as printed: EN, the old E, or another language's (two letters or the old one). */
    private static boolean isRegion(String part) {
        return part.equals("EN")
                || part.equals("E")
                || OTHER_REGIONS.contains(part)
                || (part.length() == 1 && OTHER_OLD_REGIONS.contains(part));
    }

    /**
     * The letters a region's character may stand for: a digit's look-alike letters, or a letter and
     * the other letter of its look-alike digit (I and L, O and D).
     */
    private static String regionLetters(char c) {
        if (Character.isDigit(c)) {
            return DIGIT_TO_LETTER.getOrDefault(c, "");
        }
        String digit = LETTER_TO_DIGIT.get(c);
        return digit == null ? String.valueOf(c) : DIGIT_TO_LETTER.get(digit.charAt(0));
    }

    /**
     * Whether a full code (one dash) may be English: an English shape, with look-alike letters
     * allowed for the digits of its number ({@code MRD-E0O1}).
     */
    private static boolean mayBeEnglish(String code) {
        Matcher parts = CODE.matcher(code);
        return parts.matches()
                && !isOtherLanguage(code)
                && MISREAD_ENGLISH.matcher(parts.group(2)).matches();
    }

    // ---------------------------------------------------------------------------------------
    // Exact forms
    // ---------------------------------------------------------------------------------------

    /**
     * The codes a cleaned read stands for, best first: the read itself (with a missing dash tried
     * at each place it could go, English-shaped places first), each followed by the other form of
     * an old code. Empty when it cannot be a printing code.
     */
    public static List<String> exactForms(String cleaned) {
        Set<String> forms = new LinkedHashSet<>();
        for (String base : bases(cleaned)) {
            forms.add(base);
            forms.addAll(oldForms(base));
        }
        return List.copyOf(forms);
    }

    /**
     * Whether a cleaned read is the card's 8-digit passcode (never used) or a stat, never a
     * printing code: it has no letter (every printing code has one), or, dashes left out, it has 6
     * to 10 characters (7 to 10 with a dash: {@code DL1-001} has six), all digits but at most two
     * letters a reader prints for a digit (O, D, I, L, S, B, Z, G), like {@code 9955812I}. The
     * phone's own passcode rule is the same for a run without a dash (6 to 10 characters, all
     * digits but at most two).
     */
    public static boolean isPasscode(String cleaned) {
        if (NO_LETTER.matcher(cleaned).matches()) {
            return true;
        }
        String compact = cleaned.replace("-", "");
        int shortest = compact.length() == cleaned.length() ? 6 : 7;
        if (compact.length() < shortest || compact.length() > 10) {
            return false;
        }
        int letters = 0;
        for (char c : compact.toCharArray()) {
            if (Character.isDigit(c)) {
                continue;
            }
            if (!LETTER_TO_DIGIT.containsKey(c) || ++letters > 2) {
                return false;
            }
        }
        return true;
    }

    /** The one-dash codes of a cleaned read (a missing dash or extra dashes tried). */
    static List<String> bases(String cleaned) {
        if (cleaned.isEmpty() || cleaned.length() > MAX_LENGTH || isPasscode(cleaned)) {
            return List.of();
        }
        List<String> bases = new ArrayList<>();
        int dashes = (int) cleaned.chars().filter(c -> c == '-').count();
        if (dashes == 1) {
            if (CODE.matcher(cleaned).matches()) {
                bases.add(cleaned);
            }
            return bases;
        }
        String compact = cleaned.replace("-", "");
        String regionDash = regionDashRemoved(cleaned);
        if (regionDash != null) {
            // A second dash between the region and the number: the same code (VLB-DE-005 is
            // VLB-DE005, never VLBDE-005).
            bases.add(regionDash);
            return bases;
        }
        List<Integer> places = new ArrayList<>();
        if (dashes == 0) {
            // The set part has 2 to 5 characters; the rest at least 2.
            for (int at = 2; at <= 5 && compact.length() - at >= 2; at++) {
                places.add(at);
            }
        } else {
            // Several dashes: keep one of them, drop the others.
            int position = 0;
            for (int i = 0; i < cleaned.length(); i++) {
                if (cleaned.charAt(i) == '-') {
                    places.add(position);
                } else {
                    position++;
                }
            }
        }
        List<String> candidates = new ArrayList<>();
        for (int at : places) {
            String base = compact.substring(0, at) + "-" + compact.substring(at);
            if (CODE.matcher(base).matches()) {
                candidates.add(base);
            }
        }
        candidates.sort(Comparator.comparingInt(ScanCodes::likeliness));
        bases.addAll(candidates);
        return bases;
    }

    /**
     * The code a read with two dashes stands for when its second dash sits between a region and the
     * number ({@code VLB-DE-005} is {@code VLB-DE005}, {@code LOB-E-001} is {@code LOB-E001}): a
     * middle part that is a region as printed (EN, E, or another language's), then a number (2 or 3
     * digits, sometimes after one letter, look-alike letters allowed but at least one real digit).
     * {@code null} otherwise, and the read keeps one of its dashes ({@code DL-1-001} may be {@code
     * DL1-001}).
     */
    private static @Nullable String regionDashRemoved(String cleaned) {
        String[] parts = cleaned.split("-", -1);
        if (parts.length != 3 || !isRegion(parts[1])) {
            return null;
        }
        if (!MISREAD_NUMBER.matcher(parts[2]).matches() || !ANY_DIGIT.matcher(parts[2]).find()) {
            return null;
        }
        String code = parts[0] + "-" + parts[1] + parts[2];
        return CODE.matcher(code).matches() ? code : null;
    }

    /**
     * How an English code usually looks, for the order of the places of a missing dash: a region EN
     * (0), an old Europe E (1), three digits without a region (2), any other English shape (3),
     * another shape (4).
     */
    private static int likeliness(String base) {
        if (!isEnglish(base)) {
            return 4;
        }
        String rest = base.substring(base.indexOf('-') + 1);
        if (rest.startsWith("EN")) {
            return 0;
        }
        if (OLD_EUROPE.matcher(rest).matches()) {
            return 1;
        }
        return rest.length() == 3 && OLD_NUMBER.matcher(rest).matches() ? 2 : 3;
    }

    /** The other form of an old code: {@code LOB-005 ↔ LOB-EN005}, {@code LOB-E001 → LOB-EN001}. */
    static List<String> oldForms(String code) {
        Matcher parts = CODE.matcher(code);
        if (!parts.matches()) {
            return List.of();
        }
        String set = parts.group(1);
        String rest = parts.group(2);
        if (OLD_NUMBER.matcher(rest).matches()) {
            return List.of(set + "-EN" + rest);
        }
        Matcher english = OLD_ENGLISH.matcher(rest);
        if (english.matches()) {
            return List.of(set + "-" + english.group(1));
        }
        Matcher europe = OLD_EUROPE.matcher(rest);
        if (europe.matches()) {
            return List.of(set + "-EN" + europe.group(1));
        }
        return List.of();
    }

    // ---------------------------------------------------------------------------------------
    // Look-alike variants
    // ---------------------------------------------------------------------------------------

    /**
     * A look-alike variant of a code read.
     *
     * @param code the variant (one dash)
     * @param swaps characters swapped from the read
     */
    public record Variant(String code, int swaps) {}

    /**
     * The strict look-alike variants of the exact forms of a read, the fewest swaps first (then the
     * order of the forms), at most {@value #MAX_LOOK_ALIKES}; the exact forms themselves and codes
     * of another language are left out. The other form of an old code counts as the variant itself.
     */
    public static List<Variant> lookAlikes(List<String> exactForms) {
        Set<String> exact = new LinkedHashSet<>(exactForms);
        List<Ranked> ranked = new ArrayList<>();
        int order = 0;
        for (String form : exactForms) {
            for (Variant variant : variantsOf(form)) {
                ranked.add(new Ranked(variant.code(), variant.swaps(), order++));
                for (String old : oldForms(variant.code())) {
                    ranked.add(new Ranked(old, variant.swaps(), order++));
                }
            }
        }
        ranked.sort(Comparator.comparingInt(Ranked::swaps).thenComparingInt(Ranked::order));
        Map<String, Variant> variants = new LinkedHashMap<>();
        for (Ranked candidate : ranked) {
            if (variants.size() >= MAX_LOOK_ALIKES) {
                break;
            }
            if (exact.contains(candidate.code())
                    || isOtherLanguage(candidate.code())
                    || variants.containsKey(candidate.code())) {
                continue;
            }
            variants.put(candidate.code(), new Variant(candidate.code(), candidate.swaps()));
        }
        return List.copyOf(variants.values());
    }

    private record Ranked(String code, int swaps, int order) {}

    /**
     * The strict variants of one code, the fewest swaps first, at most {@value #MAX_LOOK_ALIKES}
     * for each way of splitting its region from its number.
     */
    static List<Variant> variantsOf(String code) {
        Matcher parts = CODE.matcher(code);
        if (!parts.matches()) {
            return List.of();
        }
        String set = parts.group(1);
        String rest = parts.group(2);
        List<List<Option>> setOptions = new ArrayList<>();
        for (char c : set.toCharArray()) {
            setOptions.add(bothWays(c));
        }
        List<Variant> variants = new ArrayList<>();
        // The region has 0 (old North American prints), 1 (E) or 2 (EN) characters.
        for (int region = 0; region <= 2; region++) {
            List<List<Option>> restOptions = restOptions(rest, region);
            if (restOptions == null) {
                continue;
            }
            List<List<Option>> positions = new ArrayList<>(setOptions);
            positions.add(List.of(new Option('-', 0)));
            positions.addAll(restOptions);
            variants.addAll(enumerate(positions, MAX_LOOK_ALIKES));
        }
        variants.sort(Comparator.comparingInt(Variant::swaps));
        return variants;
    }

    /**
     * The options of each character of the part after the dash when its first {@code region}
     * characters are the region: those are letters (digits become letters); the number after them
     * is 2 or 3 digits, sometimes after one letter (letters become digits, except that first
     * letter). {@code null} when the split is impossible.
     */
    private static List<List<Option>> restOptions(String rest, int region) {
        int number = rest.length() - region;
        if (number < 2 || number > 4) {
            return null;
        }
        List<List<Option>> options = new ArrayList<>();
        for (int i = 0; i < region; i++) {
            List<Option> letter = asLetter(rest.charAt(i));
            if (letter.isEmpty()) {
                return null;
            }
            options.add(letter);
        }
        for (int i = 0; i < number; i++) {
            char c = rest.charAt(region + i);
            List<Option> choice;
            if (i == 0 && number == 4) {
                choice = asLetter(c); // a letter, then three digits
            } else if (i == 0 && number == 3) {
                choice = letterOrDigit(c); // three digits, or a letter and two digits
            } else {
                choice = asDigit(c);
            }
            if (choice.isEmpty()) {
                return null;
            }
            options.add(choice);
        }
        return options;
    }

    /** One choice for a character and whether it is a swap (1) or the character as read (0). */
    private record Option(char c, int swaps) {}

    private static List<Option> bothWays(char c) {
        List<Option> options = new ArrayList<>();
        options.add(new Option(c, 0));
        String swaps = Character.isDigit(c) ? DIGIT_TO_LETTER.get(c) : LETTER_TO_DIGIT.get(c);
        if (swaps != null) {
            swaps.chars().forEach(s -> options.add(new Option((char) s, 1)));
        }
        return options;
    }

    private static List<Option> asLetter(char c) {
        if (!Character.isDigit(c)) {
            return List.of(new Option(c, 0));
        }
        String letters = DIGIT_TO_LETTER.get(c);
        return letters == null
                ? List.of()
                : letters.chars().mapToObj(l -> new Option((char) l, 1)).toList();
    }

    private static List<Option> asDigit(char c) {
        if (Character.isDigit(c)) {
            return List.of(new Option(c, 0));
        }
        String digits = LETTER_TO_DIGIT.get(c);
        return digits == null
                ? List.of()
                : digits.chars().mapToObj(d -> new Option((char) d, 1)).toList();
    }

    private static List<Option> letterOrDigit(char c) {
        if (Character.isDigit(c)) {
            return List.of(new Option(c, 0));
        }
        List<Option> options = new ArrayList<>();
        options.add(new Option(c, 0));
        options.addAll(asDigit(c));
        return options;
    }

    /**
     * Every combination of the options with at least one swap, the fewest swaps first, at most
     * {@code cap}.
     */
    private static List<Variant> enumerate(List<List<Option>> positions, int cap) {
        int n = positions.size();
        int[] mostAfter = new int[n + 1];
        for (int i = n - 1; i >= 0; i--) {
            int most = 0;
            for (Option option : positions.get(i)) {
                most = Math.max(most, option.swaps());
            }
            mostAfter[i] = mostAfter[i + 1] + most;
        }
        List<Variant> result = new ArrayList<>();
        for (int swaps = 1; swaps <= mostAfter[0] && result.size() < cap; swaps++) {
            collect(positions, 0, swaps, swaps, mostAfter, new StringBuilder(), result, cap);
        }
        return result;
    }

    private static void collect(
            List<List<Option>> positions,
            int index,
            int budget,
            int total,
            int[] mostAfter,
            StringBuilder code,
            List<Variant> result,
            int cap) {
        if (result.size() >= cap || budget > mostAfter[index]) {
            return;
        }
        if (index == positions.size()) {
            if (budget == 0) {
                result.add(new Variant(code.toString(), total));
            }
            return;
        }
        for (Option option : positions.get(index)) {
            if (option.swaps() > budget) {
                continue;
            }
            code.append(option.c());
            collect(
                    positions,
                    index + 1,
                    budget - option.swaps(),
                    total,
                    mostAfter,
                    code,
                    result,
                    cap);
            code.setLength(code.length() - 1);
        }
    }

    // ---------------------------------------------------------------------------------------
    // One look-alike character away
    // ---------------------------------------------------------------------------------------

    /**
     * The codes one look-alike character (strict or wide) away from the exact forms of a read, at
     * most {@value #MAX_NEIGHBOURS}, exact forms and other languages left out.
     */
    public static List<String> neighbours(List<String> exactForms) {
        Set<String> exact = new LinkedHashSet<>(exactForms);
        Set<String> neighbours = new LinkedHashSet<>();
        for (String form : exactForms) {
            int dash = form.indexOf('-');
            for (int i = 0; i < form.length(); i++) {
                char c = form.charAt(i);
                if (c == '-') {
                    continue;
                }
                // The set part both ways; after the dash a letter may be a misread digit and a
                // digit another digit (the region's letters have no look-alike digit to become).
                String swaps =
                        i < dash
                                ? lookAlikesOf(c)
                                : Character.isDigit(c)
                                        ? WIDE.getOrDefault(c, "")
                                        : LETTER_TO_DIGIT.getOrDefault(c, "");
                for (char swap : swaps.toCharArray()) {
                    String neighbour = form.substring(0, i) + swap + form.substring(i + 1);
                    if (neighbours.size() >= MAX_NEIGHBOURS) {
                        return List.copyOf(neighbours);
                    }
                    if (!exact.contains(neighbour) && !isOtherLanguage(neighbour)) {
                        neighbours.add(neighbour);
                    }
                }
            }
        }
        return List.copyOf(neighbours);
    }

    /** Whether two codes differ in exactly one character and those two look alike. */
    public static boolean oneLookAlikeApart(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int differences = 0;
        int at = -1;
        for (int i = 0; i < a.length(); i++) {
            if (a.charAt(i) != b.charAt(i)) {
                differences++;
                at = i;
            }
        }
        return differences == 1 && lookAlikesOf(a.charAt(at)).indexOf(b.charAt(at)) >= 0;
    }

    /** Every look-alike of a character, strict and wide. */
    private static String lookAlikesOf(char c) {
        StringBuilder all = new StringBuilder();
        String strict = Character.isDigit(c) ? DIGIT_TO_LETTER.get(c) : LETTER_TO_DIGIT.get(c);
        if (strict != null) {
            all.append(strict);
        }
        String wide = WIDE.get(c);
        if (wide != null) {
            all.append(wide);
        }
        return all.toString();
    }
}
