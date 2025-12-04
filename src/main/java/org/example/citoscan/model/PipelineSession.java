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
    private String tilesPath; //Nuevo, hay que agregar el path a resources/sessions/{uid}/{sid}/workspace/01_tiles
    private String cellsPredsPath; //Nuevo, hay que agregar el path a pipeline/resources/sessions/{uid}/{sid}/workspace/05_cells/apto/raw_preds
    private String reportPath;
    private String logPath;
    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;

    private Integer tilesTotal;
    private Integer aptoTotal;
    private Integer noAptoTotal;
    private Integer backgroundTotal;
    private Integer notBackgroundTotal;

    private String possibleDiagnosis;
    private Integer topPatchesCount;
    private String topPatchesJsonPath; //Nuevo, hay que generar el JSON y guardarlo en pipeline/resources/sessions/{uid}/{sid}/artifacts/reports
}
