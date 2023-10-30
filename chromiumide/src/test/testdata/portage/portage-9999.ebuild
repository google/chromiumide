# Copyright 2019 The ChromiumOS Authors
# Distributed under the terms of the GNU General Public License v2

a=1 # comment
B=2#3
C= # empty#
D=()

E=(foo) #

# Some real examples follow.

CROS_WORKON_LOCALNAME="platform2"
CROS_WORKON_DESTDIR_1="${S}/platform2"
CROS_WORKON_SUBTREE="common-mk codelab .gn"

CROS_WORKON_DESTDIR=("${S}/platform2" "${S}/aosp/system/keymaster")

CROS_WORKON_DESTDIR_2=(
	"${S}/platform/ec"
	"${S}/third_party/cryptoc"
	"${S}/third_party/eigen3"
	"${S}/third_party/boringssl"
)

inherit cros-workon platform

KEYWORDS="~*"
IUSE=""

DEPEND="${RDEPEND}
	x11-drivers/opengles-headers"

src_install() {
	platform_src_install

	dobin "${OUT}"/codelab
}

platform_pkg_test() {
	platform_test "run" "${OUT}/codelab_test"
}
