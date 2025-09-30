package org.example.citoscan.service.impl;

import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.Value;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.repository.PipelineSessionRepository;
import org.example.citoscan.service.PipelineService;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PipelineServiceImpl implements PipelineService {

    @Value("${pipeline.root:/opt/pipeline_aptitud}")
    private String pipelineRoot;

    @Value("${pipeline.venv:/opt/pipeline_aptitud/venv/bin/python}")
    private String pythonBin;

    private final PipelineSessionRepository repo;

    @Override
    @Transactional
    public PipelineSession createAndRun(MultipartFile svsFile, Map<String,String> opts) throws IOException {
        PipelineSession s = new PipelineSession();
        s.setStatus("QUEUED");
        s.setCreatedAt(Instant.now());
        s = repo.save(s);

        // Paths
        Path appRoot = Paths.get("").toAbsolutePath();
        Path sourcesDir = appRoot.resolve("resources/sources");
        Path sessionDir = appRoot.resolve("resources/sessions").resolve(String.valueOf(s.getId()));
        Files.createDirectories(sourcesDir);
        Files.createDirectories(sessionDir);

        // Guardar SVS
        String cleanName = Objects.requireNonNullElse(svsFile.getOriginalFilename(), "slide_"+s.getId()+".svs");
        Path svsPath = sourcesDir.resolve(cleanName);
        Files.copy(svsFile.getInputStream(), svsPath, StandardCopyOption.REPLACE_EXISTING);

        s.setSlideName(cleanName);
        s.setStoragePath(sessionDir.toString());
        Path reportPath = sessionDir.resolve("pipeline_report.json");
        s.setReportPath(reportPath.toString());
        Path logPath = sessionDir.resolve("pipeline.log");
        s.setLogPath(logPath.toString());
        repo.save(s);

        // Lanzar proceso en background
        runAsync(s.getId(), svsPath, sessionDir, opts);
        return s;
    }

    @Async // o usar un Executor bean
    protected void runAsync(Long id, Path svsPath, Path sessionDir, Map<String,String> opts) {
        PipelineSession s = repo.findById(id).orElseThrow();
        s.setStatus("RUNNING");
        s.setStartedAt(Instant.now());
        repo.save(s);

        try {
            List<String> cmd = new ArrayList<>();
            cmd.add(pythonBin);
            cmd.add(Paths.get(pipelineRoot, "scripts", "run_pipeline.py").toString());
            cmd.add("--session_id"); cmd.add(String.valueOf(id));

            // Ejemplo: pasar flags relevantes a extractor/BG/APT
            // (usa tus nombres reales; el orquestador ya "pasa" flags)
            opts.forEach((k,v) -> { cmd.add("--"+k); cmd.add(v); });

            ProcessBuilder pb = new ProcessBuilder(cmd);
            Map<String,String> env = pb.environment();
            env.put("TF_FORCE_GPU_ALLOW_GROWTH", "1"); // según tu memoria
            pb.directory(Paths.get(pipelineRoot).toFile());
            pb.redirectErrorStream(true);
            pb.redirectOutput(sessionDir.resolve("pipeline.log").toFile());

            Process p = pb.start();
            int exit = p.waitFor();

            // Parsear report
            Path reportPath = sessionDir.resolve("pipeline_report.json");
            if (exit == 0 && Files.exists(reportPath)) {
                String json = Files.readString(reportPath);
                var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
                // levantar contadores claves (ajusta paths a tu JSON real)
                s.setTilesTotal(node.path("slides_count").asInt(0)*node.path("tiles_total").asInt(0)); // o el campo correcto
                var apt = node.path("apt");
                s.setKeptApto(apt.path("kept_apto").asInt());
                s.setKeptNoApto(apt.path("kept_no_apto").asInt());
                s.setAptoRatio(apt.path("apto_ratio").asDouble());
                s.setThresholdUsed(apt.path("threshold_used").asDouble());
                s.setLinkStrategy(apt.path("link_strategy").asText(null));
                s.setBatchSize(apt.path("batch_size").asInt());

                s.setStatus("DONE");
            } else {
                s.setStatus("ERROR");
            }
        } catch (Exception ex) {
            s.setStatus("ERROR");
        } finally {
            s.setFinishedAt(Instant.now());
            repo.save(s);
        }
    }

    @Override
    public Optional<PipelineSession> get(Long id) { return repo.findById(id); }

    @Override
    public String readReportJson(Long id) throws IOException {
        PipelineSession s = repo.findById(id).orElseThrow();
        if (s.getReportPath()==null) return "{}";
        Path p = Paths.get(s.getReportPath());
        return Files.exists(p) ? Files.readString(p) : "{}";
    }
}