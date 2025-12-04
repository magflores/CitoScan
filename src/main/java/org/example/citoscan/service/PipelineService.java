package org.example.citoscan.service;

import org.example.citoscan.model.PipelineSession;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;

public interface PipelineService {
    PipelineSession createAndRun(MultipartFile svsFile, Map<String,String> opts) throws IOException;
    PipelineSession createPreviewOnly(MultipartFile svsFile, Map<String, String> opts) throws IOException;
    PipelineSession runExisting(Long id, Map<String, String> opts) throws IOException;
    Optional<PipelineSession> get(Long id);
    String readReportJson(Long id) throws IOException;
}