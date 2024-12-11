package org.javacs;

import static org.hamcrest.Matchers.equalTo;
import static org.junit.Assert.assertThat;

import java.util.Set;
import org.junit.Before;
import org.junit.Test;

public class FileStoreTest {

    @Before
    public void setWorkspaceRoot() {
        FileStore.setWorkspaceRoots(Set.of(LanguageServerFixture.DEFAULT_WORKSPACE_ROOT));
    }

    @Test
    public void packageName() {
        var file = FindResource.path("/org/javacs/example/Goto.java");
        assertThat(FileStore.suggestedPackageName(file), equalTo("org.javacs.example"));
    }
}
