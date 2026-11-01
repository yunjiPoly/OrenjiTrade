package com.orenjitrade.api.admin.api;

import com.orenjitrade.api.admin.infra.StaffSearchRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/admin/search}: the console's top-bar search (spec 15.8.6, web stage WH2),
 * ADMIN and SUPER_ADMIN only (moderators search report numbers through {@code GET
 * /admin/reports?number=}).
 */
@RestController
@RequestMapping(path = "/api/v1/admin", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-console", description = "Dashboard and system health (admin console)")
@Validated
public class AdminSearchController {

    /** "#1047", "1047". */
    static final Pattern REPORT_NUMBER = Pattern.compile("^#?\\s*(\\d{1,12})$");

    private final StaffSearchRepository search;

    public AdminSearchController(StaffSearchRepository search) {
        this.search = search;
    }

    @GetMapping("/search")
    @Transactional(readOnly = true)
    @Operation(
            operationId = "staffSearch",
            summary = "Find a collector, a card or a report (ADMIN)",
            description =
                    "One text, grouped: accounts by handle (with or without \"@\"), email or"
                            + " display name; cards by printing code (\"LOB-EN005\") or name; a"
                            + " report by its number (\"#1047\" or \"1047\"). A text of one"
                            + " character finds nothing but a report number. At most `limit`"
                            + " per group. No place is ever returned.")
    public StaffSearchResponse search(
            @RequestParam("q") @NotBlank @Size(max = 120) String query,
            @RequestParam(defaultValue = "5") @Min(1) @Max(10) int limit) {
        String text = query.strip();
        Matcher number = REPORT_NUMBER.matcher(text);
        List<StaffSearchResponse.Report> reports =
                number.matches()
                        ? search
                                .report(Long.parseLong(number.group(1)))
                                .map(StaffSearchResponse.Report::from)
                                .stream()
                                .toList()
                        : List.of();
        boolean words = text.length() >= 2 && !text.startsWith("#");
        List<StaffSearchResponse.Collector> collectors =
                words
                        ? search.collectors(text, limit).stream()
                                .map(StaffSearchResponse.Collector::from)
                                .toList()
                        : List.of();
        List<StaffSearchResponse.Card> cards =
                words && !text.startsWith("@") && !text.contains("@")
                        ? search.cards(text, limit).stream()
                                .map(StaffSearchResponse.Card::from)
                                .toList()
                        : List.of();
        return new StaffSearchResponse(collectors, cards, reports);
    }
}
