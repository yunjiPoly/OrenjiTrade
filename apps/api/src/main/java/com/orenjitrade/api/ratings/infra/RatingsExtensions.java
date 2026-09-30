package com.orenjitrade.api.ratings.infra;

import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.profiles.domain.RatingSummaryProvider;
import com.orenjitrade.api.ratings.domain.RatingService;
import com.orenjitrade.api.ratings.domain.RatingService.RatingSummaryView;
import com.orenjitrade.api.ratings.domain.ReferenceService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The ratings module's implementations of other modules' extension points: the profiles module's
 * {@link RatingSummaryProvider} (collector profiles, map markers, previews and the nearby ranking
 * read {@code rating_summary}), the export section {@code ratings} and the deletion participant.
 */
@Configuration(proxyBeanMethods = false)
public class RatingsExtensions {

    @Bean
    RatingSummaryProvider ratingSummaryProvider(RatingService ratingService) {
        return new RatingSummaryProvider() {
            @Override
            public RatingSummary ratingOf(UUID userId) {
                return summary(ratingService.summaryOf(userId));
            }

            @Override
            public Map<UUID, RatingSummary> ratingsOf(Collection<UUID> userIds) {
                Map<UUID, RatingSummaryView> found = ratingService.summariesOf(userIds);
                Map<UUID, RatingSummary> result = new LinkedHashMap<>();
                for (UUID id : userIds) {
                    RatingSummaryView view = found.get(id);
                    result.put(id, view == null ? RatingSummary.NONE : summary(view));
                }
                return result;
            }
        };
    }

    static RatingSummary summary(RatingSummaryView view) {
        return view.count() == 0
                ? RatingSummary.NONE
                : new RatingSummary(view.average(), view.count());
    }

    @Bean
    @Order(460)
    DeletionParticipant ratingsDeletionParticipant(
            RatingService ratingService, ReferenceService referenceService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "ratings";
            }

            @Override
            public void purge(UUID userId) {
                ratingService.purge(userId);
                referenceService.purge(userId);
            }
        };
    }

    @Bean
    @Order(460)
    ExportContributor ratingsExportContributor(
            RatingService ratingService, ReferenceService referenceService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "ratings";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                Map<String, Object> section = new LinkedHashMap<>();
                section.put("ratings", ratingService.export(userId));
                section.put("references", referenceService.export(userId));
                return section;
            }
        };
    }
}
