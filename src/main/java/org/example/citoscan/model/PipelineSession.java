package org.example.citoscan.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "pipeline_sessions")
@Getter
@Setter
public class PipelineSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    private String slideName;
    private String status;
    private String storagePath;
    private String reportPath;
    private String logPath;
    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;

    private Integer tilesTotal;
    private Integer keptApto;
    private Integer keptNoApto;
    private Double aptoRatio;
    private String linkStrategy;
    private Double thresholdUsed;
    private Integer batchSize;
}
