package com.orenjitrade.api.moderation.infra;

import com.orenjitrade.api.moderation.domain.ModerationRule;
import com.orenjitrade.api.moderation.domain.ModerationRuleKind;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Repository of {@link ModerationRule}; used only inside the moderation module. */
public interface ModerationRuleRepository extends JpaRepository<ModerationRule, UUID> {

    List<ModerationRule> findByKindAndActiveTrue(ModerationRuleKind kind);
}
