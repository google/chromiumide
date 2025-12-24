package org.javacs.hover;

import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.lang.model.element.Element;

class FindHoverElement extends TreePathScanner<Element, Long> {

    private final JavacTask task;
    private CompilationUnitTree root;

    FindHoverElement(JavacTask task) {
        this.task = task;
    }

    @Override
    public Element visitCompilationUnit(CompilationUnitTree t, Long find) {
        root = t;
        return super.visitCompilationUnit(t, find);
    }

    @Override
    public Element visitIdentifier(IdentifierTree t, Long find) {
        var pos = Trees.instance(task).getSourcePositions();
        var start = pos.getStartPosition(root, t);
        var end = pos.getEndPosition(root, t);
        if (start <= find && find < end) {
            return Trees.instance(task).getElement(getCurrentPath());
        }
        return super.visitIdentifier(t, find);
    }

    @Override
    public Element visitMemberSelect(MemberSelectTree t, Long find) {
        var pos = Trees.instance(task).getSourcePositions();
        var start = pos.getEndPosition(root, t.getExpression()) + 1;
        var end = pos.getEndPosition(root, t);
        if (start <= find && find < end) {
            return Trees.instance(task).getElement(getCurrentPath());
        }
        return super.visitMemberSelect(t, find);
    }

    @Override
    public Element visitMemberReference(MemberReferenceTree t, Long find) {
        var pos = Trees.instance(task).getSourcePositions();
        var start = pos.getStartPosition(root, t.getQualifierExpression()) + 2;
        var end = pos.getEndPosition(root, t);
        if (start <= find && find < end) {
            return Trees.instance(task).getElement(getCurrentPath());
        }
        return super.visitMemberReference(t, find);
    }

    @Override
    public Element reduce(Element a, Element b) {
        if (a != null) return a;
        else return b;
    }
}
