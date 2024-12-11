# Copyright 2023 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# This dockerfile provides a stable base for ide unit tests, and is meant to
# be ran by the CQ builders to insulate them from internal bot specifics.

FROM ubuntu:22.04

# Update the package list.
ENV DEBIAN_FRONTEND noninteractive
RUN apt update && apt upgrade -y

# Install some common tools.
RUN apt install -y \
    curl \
    git \
    maven \
    netcat \
    openjdk-21-jdk \
    python3 \
    rsync \
    software-properties-common \
    sudo \
    wget \
    xvfb

RUN apt-get install -y wget
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | \
    apt-key add - && \
    echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> \
    /etc/apt/sources.list.d/google.list
RUN apt-get update && apt-get -y install google-chrome-stable

# Add the chrome-bot-docker user and switch to it.
RUN useradd -m -s /bin/bash chrome-bot-docker
RUN usermod -aG sudo chrome-bot-docker

RUN echo "chrome-bot-docker ALL=(ALL:ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set the working directory.
USER chrome-bot-docker
WORKDIR /home/chrome-bot-docker

# The tests like git config.
RUN git config --global user.email "cros-cq-automation@notanemail.com"
RUN git config --global user.name "ChromeOS Internal CQ Automation"

# Make a deep copy of the source we need resolving all the symlinks.
COPY .dockercopy/ide /home/chrome-bot-docker/ro/infra/ide

RUN sudo chown -R chrome-bot-docker:chrome-bot-docker \
    /home/chrome-bot-docker/ro/infra/ide

# It wants a cros ide config value from chromite?
RUN mkdir -p /home/chrome-bot-docker/.config/chromite
RUN echo "{\"userid\":\"23ef71f3-294e-43bc-b06b-711970be5ec4\"" \
         ",\"date\":\"2023-11-17T18:18:00.843Z\"}" > \
         /home/chrome-bot-docker/.config/chromite/cros-ide.google-analytics-uid

# Install depot_tools CIPD.
RUN git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
ENV PATH=/home/chrome-bot-docker/depot_tools:$PATH
