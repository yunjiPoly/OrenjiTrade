package com.orenjitrade.api.jobs.infra;

import com.orenjitrade.api.jobs.domain.JobRun;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobRunRepository extends JpaRepository<JobRun, UUID> {

    List<JobRun> findByNameOrderByStartedAtDesc(String name, Pageable pageable);
}
