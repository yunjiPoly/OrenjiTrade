package com.orenjitrade.api.users.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.infra.ConsentProperties;
import com.orenjitrade.api.users.infra.LegalDocumentRepository;
import com.orenjitrade.api.users.infra.UserConsentRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** The service-layer 18+ gate ({@link ConsentService#requireAgeConfirmed}). */
class ConsentServiceTest {

    private static final UUID USER = UUID.randomUUID();

    private final LegalDocumentRepository documents = mock(LegalDocumentRepository.class);
    private final UserConsentRepository consents = mock(UserConsentRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final ConsentService service =
            new ConsentService(
                    documents,
                    consents,
                    audit,
                    TimeProvider.fixed(Instant.parse("2026-10-05T12:00:00Z")),
                    new ConsentProperties("test-salt"));

    @Test
    void passesSilentlyOnceAnyVersionOfTheConfirmationWasRecorded() {
        when(consents.existsByUserIdAndDocumentType(USER, LegalDocumentType.AGE_CONFIRMATION))
                .thenReturn(true);

        assertThat(service.hasConfirmedAge(USER)).isTrue();
        assertThatCode(() -> service.requireAgeConfirmed(USER)).doesNotThrowAnyException();
        verifyNoInteractions(documents, audit);
    }

    @Test
    void refusesWith403AndNamesTheConsentToRecord() {
        when(consents.existsByUserIdAndDocumentType(USER, LegalDocumentType.AGE_CONFIRMATION))
                .thenReturn(false);
        LegalDocument current = mock(LegalDocument.class);
        when(current.getDocumentType()).thenReturn(LegalDocumentType.AGE_CONFIRMATION);
        when(current.getVersion()).thenReturn("2026-10-05");
        when(documents.findByDocumentTypeAndCurrentTrue(LegalDocumentType.AGE_CONFIRMATION))
                .thenReturn(Optional.of(current));

        assertThatThrownBy(() -> service.requireAgeConfirmed(USER))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        problem -> {
                            assertThat(problem.getErrorCode())
                                    .isEqualTo(ErrorCode.AGE_CONFIRMATION_REQUIRED);
                            assertThat(problem.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                            assertThat(problem.getMessage()).contains("18 years of age or older");
                            assertThat(problem.getProperties())
                                    .containsEntry(
                                            ConsentService.REQUIRED_CONSENTS_PROPERTY,
                                            List.of(
                                                    new RequiredConsent(
                                                            LegalDocumentType.AGE_CONFIRMATION,
                                                            "2026-10-05")));
                        });
    }

    @Test
    void stillRefusesWhenNoCurrentConfirmationDocumentExists() {
        when(consents.existsByUserIdAndDocumentType(USER, LegalDocumentType.AGE_CONFIRMATION))
                .thenReturn(false);
        when(documents.findByDocumentTypeAndCurrentTrue(LegalDocumentType.AGE_CONFIRMATION))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.requireAgeConfirmed(USER))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        problem -> {
                            assertThat(problem.getErrorCode())
                                    .isEqualTo(ErrorCode.AGE_CONFIRMATION_REQUIRED);
                            assertThat(problem.getProperties()).isEmpty();
                        });
    }

    @Test
    void theErrorCodeIsA403WithAStableProblemType() {
        assertThat(ErrorCode.AGE_CONFIRMATION_REQUIRED.defaultStatus())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ErrorCode.AGE_CONFIRMATION_REQUIRED.problemType())
                .endsWith("/problems/age-confirmation-required");
    }
}
