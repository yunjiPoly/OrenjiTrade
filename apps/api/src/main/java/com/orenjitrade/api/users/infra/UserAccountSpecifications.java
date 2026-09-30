package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.AdminUserQuery;
import com.orenjitrade.api.users.domain.UserAccount;
import com.orenjitrade.api.users.domain.UserRole;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/** Criteria for the admin user list. */
public final class UserAccountSpecifications {

    private UserAccountSpecifications() {}

    public static Specification<UserAccount> matching(AdminUserQuery query) {
        return (root, criteriaQuery, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (query.query() != null && !query.query().isBlank()) {
                String pattern =
                        "%" + escapeLike(query.query().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(
                        builder.or(
                                builder.like(builder.lower(root.get("handle")), pattern, '\\'),
                                builder.like(builder.lower(root.get("email")), pattern, '\\'),
                                builder.like(
                                        builder.lower(root.get("displayName")), pattern, '\\')));
            }
            if (query.status() != null) {
                predicates.add(builder.equal(root.get("status"), query.status()));
            }
            if (query.role() != null && criteriaQuery != null) {
                Subquery<Integer> subquery = criteriaQuery.subquery(Integer.class);
                Root<UserRole> role = subquery.from(UserRole.class);
                Join<UserRole, UserAccount> user = role.join("user");
                subquery.select(builder.literal(1))
                        .where(
                                builder.equal(user.get("id"), root.get("id")),
                                builder.equal(role.get("id").get("role"), query.role()));
                predicates.add(builder.exists(subquery));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
