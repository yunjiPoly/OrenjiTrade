package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.profiles.infra.TagSearchRepository;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Tag lookup for {@code GET /api/v1/tags}. */
@Service
public class TagService {

    private final TagSearchRepository searchRepository;

    public TagService(TagSearchRepository searchRepository) {
        this.searchRepository = searchRepository;
    }

    /**
     * Active tags matching {@code query} (accent/case-insensitive substring of label or slug; all
     * tags when blank), optionally of one category; prefix matches first, then most used.
     */
    @Transactional(readOnly = true)
    public List<TagView> search(@Nullable String query, @Nullable TagCategory category, int limit) {
        return searchRepository.search(query, category, limit);
    }
}
