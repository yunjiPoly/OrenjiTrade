package com.orenjitrade.api.audit.infra;

import com.orenjitrade.api.audit.domain.AuditLog;
import com.orenjitrade.api.audit.domain.AuditLogFilter;
import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.jpa.domain.Specification;

/** Criteria for {@link AuditLogFilter} (null fields are ignored). */
public final class AuditLogSpecifications {

    private AuditLogSpecifications() {}

    public static Specification<AuditLog> matching(AuditLogFilter filter) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter.actorId() != null) {
                predicates.add(builder.equal(root.get("actorUserId"), filter.actorId()));
            }
            if (filter.targetType() != null && !filter.targetType().isBlank()) {
                predicates.add(builder.equal(root.get("targetType"), filter.targetType()));
            }
            if (filter.targetId() != null && !filter.targetId().isBlank()) {
                predicates.add(builder.equal(root.get("targetId"), filter.targetId()));
            }
            if (filter.action() != null && !filter.action().isBlank()) {
                predicates.add(builder.equal(root.get("action"), filter.action()));
            }
            if (filter.from() != null) {
                predicates.add(builder.greaterThanOrEqualTo(root.get("occurredAt"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(builder.lessThan(root.get("occurredAt"), filter.to()));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
    }
}
